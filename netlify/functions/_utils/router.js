// netlify/functions/_utils/router.js
// ============================================================
// Transit Routing Engine — Multi-Criteria Dijkstra
// Finds up to 4 distinct route variants:
//   fastest   – minimise total time (ride + wait + walk)
//   comfort   – minimise transfers
//   cheapest  – minimise fare (+ reasonable time)
//   walking   – minimise walking distance
//
// Memory-efficient design:
//   • Binary min-heap (O(log n) vs the old O(n log n) Array.sort)
//   • Compact label store: labels are plain objects pushed into a
//     flat array; back-links use integer indices, not object refs.
//     This avoids deep pointer chains that blow Netlify's 1 GB RAM
//     limit and cause 502s.
// ============================================================

'use strict';

const { calcWaitMinutes, TRANSFER_MIN } = require('./graph-builder');

// ── Weights ───────────────────────────────────────────────────────────────────
const WEIGHTS = {
  fastest:   { time: 1.0, walk: 1.5, fare: 0.0, transfers: 5  },
  comfort:   { time: 0.5, walk: 1.0, fare: 0.0, transfers: 15 },
  cheapest:  { time: 0.3, walk: 0.5, fare: 0.5, transfers: 3  },
  walking:   { time: 0.5, walk: 3.0, fare: 0.0, transfers: 5  },
  accessible:{ time: 0.8, walk: 1.0, fare: 0.0, transfers: 8  },
};

const MAX_TRANSFERS = 4;
const MAX_WALK_MIN  = 10;  // >10 min walks between stops are rarely optimal in a city network

// ── Binary Min-Heap ───────────────────────────────────────────────────────────
class MinHeap {
  constructor() { this._h = []; }
  get size()    { return this._h.length; }

  push(item) {
    this._h.push(item);
    this._up(this._h.length - 1);
  }

  pop() {
    const top  = this._h[0];
    const last = this._h.pop();
    if (this._h.length) { this._h[0] = last; this._down(0); }
    return top;
  }

  _up(i) {
    const h = this._h;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p].score <= h[i].score) break;
      [h[p], h[i]] = [h[i], h[p]]; i = p;
    }
  }

  _down(i) {
    const h = this._h, n = h.length;
    for (;;) {
      let s = i, l = 2*i+1, r = l+1;
      if (l < n && h[l].score < h[s].score) s = l;
      if (r < n && h[r].score < h[s].score) s = r;
      if (s === i) break;
      [h[s], h[i]] = [h[i], h[s]]; i = s;
    }
  }
}

// ── Main entry ────────────────────────────────────────────────────────────────
function findRoutes(opts) {
  const {
    originStopIds,
    destStopIds,
    graph,
    stopMap,
    lineMap,
    scheduleMap,
    departureTime,
    searchType          = 'fastest',
    accessibleOnly      = false,
    walkingOriginMinutes = 0,
    walkingDestMinutes   = 0,
    originCoords,
    destCoords,
  } = opts;

  const W       = WEIGHTS[searchType] || WEIGHTS.fastest;
  const destSet = new Set(destStopIds);

  // ── Compact label store ───────────────────────────────────────────────────
  // Each label is stored once in `store`. Heap items carry only the store index
  // and the score (for ordering). Back-links are integer indices — no object
  // pointer chains, so GC pressure is minimal even with 50 k+ labels.
  //
  // label = {
  //   stopId, score, totalTime, transfers, fare, walkMin,
  //   boardedLineId, parentIdx (-1 = root), edge (the edge taken to arrive here)
  // }
  const store = []; // flat array of all settled/queued labels

  // Dominance map: bestScore[key] = score
  // Include 15-minute time buckets to prevent keeping many labels at the same stop
  // that differ only in arrival time within a 15-minute window.
  const bestScore = new Map();
  const bKey = (stopId, transfers, lineId, bucket) =>
    `${stopId}:${transfers}:${lineId ?? 'w'}:${bucket}`;
  const getBest = (s, t, l, b)    => bestScore.get(bKey(s,t,l,b)) ?? Infinity;
  const setBest = (s, t, l, b, v) => bestScore.set(bKey(s,t,l,b), v);

  const heap = new MinHeap();

  // Seed origin stops
  for (const sid of originStopIds) {
    const wm    = walkingOriginMinutes;
    const score = W.walk * wm;
    const bucket = Math.floor(wm / 15);
    if (score >= getBest(sid, 0, null, bucket)) continue;
    setBest(sid, 0, null, bucket, score);
    const idx = store.length;
    store.push({
      stopId: sid, score, totalTime: wm, transfers: 0,
      fare: 0, walkMin: wm, boardedLineId: null,
      parentIdx: -1, edge: null,
    });
    heap.push({ idx, score });
  }

  const completedIdxs     = [];
  const seenDestSigs       = new Set();

  // Safeguards: prevent endless search and guarantee return before Netlify's 10s limit
  const MAX_LABELS = 15000;   // safety cap
  let labelCount = 0;
  const startTime = Date.now();
  const MAX_TIME_MS = 9500;   // leave 500ms for response

  while (heap.size > 0) {
    const { idx, score: heapScore } = heap.pop();
    const curr = store[idx];

    // Early termination safeguards
    labelCount++;
    if (labelCount > MAX_LABELS || (Date.now() - startTime) > MAX_TIME_MS) {
      console.warn(`Router terminating early: labels=${labelCount} time=${Date.now()-startTime}ms`);
      break;
    }

    // Stale check
    const currBucket = Math.floor(curr.totalTime / 15);
    if (heapScore > getBest(curr.stopId, curr.transfers, curr.boardedLineId, currBucket) * 1.001) continue;

    // ── Destination reached ──────────────────────────────────────────────
    if (destSet.has(curr.stopId)) {
      const sig = `${curr.stopId}:${curr.transfers}:${curr.boardedLineId ?? 'w'}`;
      if (!seenDestSigs.has(sig)) {
        seenDestSigs.add(sig);
        completedIdxs.push(idx);
      }
      if (completedIdxs.length >= 8) break;
      continue;
    }

    if (curr.transfers > MAX_TRANSFERS) continue;

    const edges = graph[curr.stopId] || [];
    for (const edge of edges) {
      const { toStopId, travelTime, edgeType, lineId, isAccessible, fare } = edge;

      if (accessibleOnly && !isAccessible)                continue;
      if (edgeType === 'walk' && travelTime > MAX_WALK_MIN) continue;

      const isTransfer = edgeType === 'bus' &&
                         curr.boardedLineId !== null &&
                         curr.boardedLineId !== lineId;
      const newTransfers = curr.transfers + (isTransfer ? 1 : 0);
      if (newTransfers > MAX_TRANSFERS) continue;

      const isBoarding = edgeType === 'bus' && curr.boardedLineId !== lineId;
      let waitMin = 0;
      if (isBoarding) {
        // Use the real clock time when the user arrives at this stop, not the
        // original departure time. This correctly prunes lines that have stopped
        // running by the time the user gets there, and gives accurate wait times.
        const actualArrival = new Date(departureTime.getTime() + curr.totalTime * 60000);
        waitMin = calcWaitMinutes(lineId, actualArrival, scheduleMap, lineMap);
        if (waitMin === Infinity) continue;
      }

      const transferPenalty = isTransfer ? TRANSFER_MIN : 0;
      const addedTime       = waitMin + travelTime + transferPenalty;
      const newWalkMin      = curr.walkMin + (edgeType === 'walk' ? travelTime : 0);
      const newTotal        = curr.totalTime + addedTime;
      const newFare         = curr.fare + (isBoarding ? (fare ?? 0) : 0);
      const newBoardedLine  = edgeType === 'bus' ? lineId : curr.boardedLineId;

      const addedScore =
        W.time      * addedTime +
        W.walk      * (edgeType === 'walk' ? travelTime : 0) +
        W.transfers * (isTransfer ? 1 : 0) +
        W.fare      * (isBoarding ? (fare ?? 0) : 0);
      const newScore = curr.score + addedScore;

      const newBucket = Math.floor(newTotal / 15);
      const existing = getBest(toStopId, newTransfers, newBoardedLine, newBucket);
      if (newScore >= existing * 1.5) continue;
      if (newScore < existing) setBest(toStopId, newTransfers, newBoardedLine, newBucket, newScore);

      const newIdx = store.length;
      store.push({
        stopId: toStopId, score: newScore, totalTime: newTotal,
        transfers: newTransfers, fare: newFare, walkMin: newWalkMin,
        boardedLineId: newBoardedLine,
        parentIdx: idx,   // ← integer index, not an object reference
        edge,             // edge is a reference to the graph's own edge object (not copied)
      });
      heap.push({ idx: newIdx, score: newScore });
    }
  }

  if (completedIdxs.length === 0) return [];

  // Sort by score, pick best 8
  completedIdxs.sort((a, b) => store[a].score - store[b].score);
  const top8 = completedIdxs.slice(0, 8);

  const reconstructed = top8.map((endIdx, i) =>
    reconstructRoute(endIdx, store, stopMap, i + 1, walkingDestMinutes)
  );

  return deduplicateRoutes(reconstructed);
}

// ── Route reconstruction ───────────────────────────────────────────────────────
function reconstructRoute(endIdx, store, stopMap, id, finalWalkMin) {
  // Walk the index chain to collect edges (cheap: just integer hops)
  const segments = [];
  let idx = endIdx;
  while (idx !== -1) {
    const label = store[idx];
    if (label.edge !== null) {
      segments.unshift({
        fromStopId: store[label.parentIdx].stopId,
        toStopId:   label.stopId,
        edge:       label.edge,
      });
    }
    idx = label.parentIdx;
  }

  // Group consecutive same-line bus segments
  const steps = [];
  let i = 0;
  while (i < segments.length) {
    const seg  = segments[i];
    const { edge } = seg;

    if (edge.edgeType === 'walk') {
      const fromStop = stopMap.get(seg.fromStopId);
      const toStop   = stopMap.get(seg.toStopId);
      steps.push({
        type:        'walk',
        fromStopId:  seg.fromStopId,
        toStopId:    seg.toStopId,
        fromStation: fromStop?.name || '—',
        toStation:   toStop?.name   || '—',
        time:        edge.travelTime,
        distanceM:   Math.round(edge.travelTime * 66),
      });
      i++;
    } else {
      const { lineId, lineNumber, lineName, lineColor, fare } = edge;
      let   rideTime     = edge.travelTime;
      const fromStop     = stopMap.get(seg.fromStopId);
      let   toStop       = stopMap.get(seg.toStopId);
      const stopSequence = [fromStop?.name || '—', toStop?.name || '—'];

      let j = i + 1;
      while (
        j < segments.length &&
        segments[j].edge.edgeType === 'bus' &&
        segments[j].edge.lineId === lineId
      ) {
        rideTime += segments[j].edge.travelTime;
        toStop    = stopMap.get(segments[j].toStopId);
        stopSequence.push(toStop?.name || '—');
        j++;
      }

      steps.push({
        type:         'bus',
        lineId,
        lineNumber,
        lineName,
        lineColor,
        fare,
        polyline:     edge.polyline     || edge.linePolyline || null,
        linePolyline: edge.linePolyline || null,
        fromStopId:   seg.fromStopId,
        toStopId:     segments[j - 1].toStopId,
        fromStation:  fromStop?.name || '—',
        toStation:    toStop?.name   || '—',
        stopSequence,
        time:         rideTime,
      });
      i = j;
    }
  }

  // Final walking leg
  if (finalWalkMin > 0) {
    const lastSeg  = segments[segments.length - 1];
    const lastStop = stopMap.get(lastSeg?.toStopId);
    steps.push({
      type:        'walk',
      fromStopId:  lastSeg?.toStopId ?? null,
      toStopId:    null,
      fromStation: lastStop?.name || '—',
      toStation:   'Destinacioni juaj',
      time:        finalWalkMin,
      distanceM:   Math.round(finalWalkMin * 66),
    });
  }

  const endLabel  = store[endIdx];
  const busSteps  = steps.filter(s => s.type === 'bus');
  const busLines  = busSteps.map(s => ({ number: s.lineNumber, color: s.lineColor, name: s.lineName }));
  const totalFare = busSteps.reduce((sum, s) => sum + (s.fare || 0), 0) || 40;

  return {
    id,
    totalTime:   endLabel.totalTime + finalWalkMin,
    score:       endLabel.score,
    transfers:   endLabel.transfers,
    fare:        totalFare,
    walkMin:     endLabel.walkMin + (finalWalkMin || 0),
    steps,
    busLines,
    fromStation: steps[0]?.fromStation || '—',
    toStation:   steps[steps.length - 1]?.toStation || '—',
  };
}

// ── Deduplication ─────────────────────────────────────────────────────────────
function deduplicateRoutes(routes) {
  if (!routes.length) return [];

  const kept   = [routes[0]];
  const tryAdd = c => { if (!kept.find(r => r.id === c.id)) kept.push(c); };

  tryAdd([...routes].sort((a,b) => a.transfers - b.transfers || a.totalTime - b.totalTime)[0]);
  tryAdd([...routes].sort((a,b) => a.walkMin   - b.walkMin   || a.totalTime - b.totalTime)[0]);
  tryAdd([...routes].sort((a,b) => a.fare       - b.fare       || a.totalTime - b.totalTime)[0]);

  const labels = ['Më e shpejta', 'Më pak ndërrime', 'Më pak ecje', 'Çmim i ulët'];
  return kept.slice(0, 4).map((r, i) => ({ ...r, title: labels[i] || `Rruga ${i+1}`, id: i+1 }));
}

module.exports = { findRoutes };