// netlify/functions/_utils/router.js
// ============================================================
// Transit Routing Engine — Multi-Criteria Dijkstra
// Finds up to 4 distinct route variants:
//   fastest   – minimise total time (ride + wait + walk)
//   comfort   – minimise transfers
//   cheapest  – minimise fare (+ reasonable time)
//   walking   – minimise walking distance
//
// Algorithm: label-correcting multi-criteria Dijkstra with a
//            binary min-heap priority queue (O(E log V) instead
//            of the previous O(E·V) caused by Array.sort()).
// ============================================================

'use strict';

const { calcWaitMinutes, TRANSFER_MIN } = require('./graph-builder');

// ── Scoring weights per search-type ───────────────────────────────────────────
const WEIGHTS = {
  fastest:   { time: 1.0, walk: 1.5,  fare: 0.0,  transfers: 5  },
  comfort:   { time: 0.5, walk: 1.0,  fare: 0.0,  transfers: 15 },
  cheapest:  { time: 0.3, walk: 0.5,  fare: 0.5,  transfers: 3  },
  walking:   { time: 0.5, walk: 3.0,  fare: 0.0,  transfers: 5  },
  accessible:{ time: 0.8, walk: 1.0,  fare: 0.0,  transfers: 8  },
};

const MAX_TRANSFERS = 4;
const MAX_WALK_MIN  = 20;   // hard cap on a single walking leg

// ── Binary Min-Heap ───────────────────────────────────────────────────────────
// Replaces the O(n log n) Array.sort() that caused the 504 timeout.
// Each operation is O(log n).
class MinHeap {
  constructor() { this._h = []; }

  get size() { return this._h.length; }

  push(item) {
    this._h.push(item);
    this._bubbleUp(this._h.length - 1);
  }

  pop() {
    const top = this._h[0];
    const last = this._h.pop();
    if (this._h.length > 0) {
      this._h[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._h[parent].score <= this._h[i].score) break;
      [this._h[parent], this._h[i]] = [this._h[i], this._h[parent]];
      i = parent;
    }
  }

  _siftDown(i) {
    const n = this._h.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._h[l].score < this._h[smallest].score) smallest = l;
      if (r < n && this._h[r].score < this._h[smallest].score) smallest = r;
      if (smallest === i) break;
      [this._h[smallest], this._h[i]] = [this._h[i], this._h[smallest]];
      i = smallest;
    }
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * @param {Object}   opts
 * @param {number[]} opts.originStopIds       – candidate start stops (sorted by proximity)
 * @param {number[]} opts.destStopIds         – candidate end stops
 * @param {Object}   opts.graph               – adjacency list from graph-builder
 * @param {Map}      opts.stopMap
 * @param {Map}      opts.lineMap
 * @param {Map}      opts.scheduleMap
 * @param {Date}     opts.departureTime
 * @param {string}   opts.searchType          – 'fastest'|'comfort'|'cheapest'|'walking'|'accessible'
 * @param {boolean}  opts.accessibleOnly
 * @param {number}   opts.walkingOriginMinutes  – walk from user to origin stop
 * @param {number}   opts.walkingDestMinutes    – walk from dest stop to user dest
 * @param {Object}   opts.originCoords
 * @param {Object}   opts.destCoords
 * @returns {Object[]} Array of route objects (up to 4)
 */
function findRoutes(opts) {
  const {
    originStopIds,
    destStopIds,
    graph,
    stopMap,
    lineMap,
    scheduleMap,
    departureTime,
    searchType     = 'fastest',
    accessibleOnly = false,
    walkingOriginMinutes = 0,
    walkingDestMinutes   = 0,
    originCoords,
    destCoords,
  } = opts;

  const weights = WEIGHTS[searchType] || WEIGHTS.fastest;
  const destSet = new Set(destStopIds);

  // ── Per-stop best scores (dominance pruning) ───────────────────────────────
  // Key: `${stopId}:${transfers}:${boardedLineId ?? 'walk'}`
  // Keeps the search focused without the visited-set overhead.
  const bestScore = new Map();

  const getBest = (stopId, transfers, lineId) => {
    const key = `${stopId}:${transfers}:${lineId ?? 'w'}`;
    return bestScore.get(key) ?? Infinity;
  };
  const setBest = (stopId, transfers, lineId, score) => {
    const key = `${stopId}:${transfers}:${lineId ?? 'w'}`;
    bestScore.set(key, score);
  };

  // ── Priority queue (min-heap) ──────────────────────────────────────────────
  const heap = new MinHeap();

  // Seed: all origin stops
  for (const sid of originStopIds) {
    const walkMin = walkingOriginMinutes;
    const label = {
      stopId:        sid,
      score:         weights.walk * walkMin,
      totalTime:     walkMin,
      transfers:     0,
      fare:          0,
      walkMin,
      boardedLineId: null,
      prev:          null,
      prevEdge:      null,
    };
    if (label.score < getBest(sid, 0, null)) {
      setBest(sid, 0, null, label.score);
      heap.push(label);
    }
  }

  const completedRoutes = [];
  // Deduplicate destinations: key = stopId:transfers:lastLine
  const seenDestSignatures = new Set();

  while (heap.size > 0) {
    const curr = heap.pop();

    // Stale label check (score may have improved since this label was enqueued)
    if (curr.score > getBest(curr.stopId, curr.transfers, curr.boardedLineId) * 1.001) continue;

    // ── Destination reached ────────────────────────────────────────────────
    if (destSet.has(curr.stopId)) {
      const finalWalk  = walkingDestMinutes;
      const finalTime  = curr.totalTime + finalWalk;
      const finalScore = curr.score + weights.walk * finalWalk;
      // Signature: stop + transfer-count + last line to avoid exact duplicates
      const sig = `${curr.stopId}:${curr.transfers}:${curr.boardedLineId ?? 'w'}`;

      if (!seenDestSignatures.has(sig)) {
        seenDestSignatures.add(sig);
        completedRoutes.push({
          ...curr,
          totalTime:    finalTime,
          score:        finalScore,
          walkMinFinal: finalWalk,
        });
      }
      if (completedRoutes.length >= 8) break;
      // Do NOT continue — let the search find alternative routes through other paths
      continue;
    }

    // ── Prune: too many transfers ──────────────────────────────────────────
    if (curr.transfers > MAX_TRANSFERS) continue;

    // ── Expand edges ───────────────────────────────────────────────────────
    const edges = graph[curr.stopId] || [];
    for (const edge of edges) {
      const { toStopId, travelTime, edgeType, lineId, isAccessible, fare } = edge;

      if (accessibleOnly && !isAccessible) continue;
      if (edgeType === 'walk' && travelTime > MAX_WALK_MIN) continue;

      // ── Transfer detection ───────────────────────────────────────────────
      // A transfer happens when we switch from one bus line to another.
      // Boarding for the first time (boardedLineId === null) is NOT a transfer.
      const isTransfer = (
        edgeType === 'bus' &&
        curr.boardedLineId !== null &&
        curr.boardedLineId !== lineId
      );

      const newTransfers = curr.transfers + (isTransfer ? 1 : 0);
      if (newTransfers > MAX_TRANSFERS) continue;

      // ── Wait time ────────────────────────────────────────────────────────
      // Pay wait cost only when boarding a bus (first time or after a transfer).
      // Staying on the same line never incurs a wait.
      let waitMin = 0;
      const isBoarding = edgeType === 'bus' && curr.boardedLineId !== lineId;
      if (isBoarding) {
        waitMin = calcWaitMinutes(lineId, departureTime, scheduleMap, lineMap);
        if (waitMin === Infinity) continue; // line not operating
      }

      const transferPenalty = isTransfer ? TRANSFER_MIN : 0;
      const addedTime       = waitMin + travelTime + transferPenalty;
      const newWalkMin      = curr.walkMin + (edgeType === 'walk' ? travelTime : 0);
      const newTotal        = curr.totalTime + addedTime;

      // ── Fare: charge once per boarding event ─────────────────────────────
      // First boarding: boardedLineId was null, now boarding a bus.
      // Transfer: boardedLineId was set, now switching to a different line.
      const newFare = curr.fare + (isBoarding ? (fare ?? 0) : 0);

      const addedScore =
        weights.time      * addedTime +
        weights.walk      * (edgeType === 'walk' ? travelTime : 0) +
        weights.transfers * (isTransfer ? 1 : 0) +
        weights.fare      * (isBoarding ? (fare ?? 0) : 0);

      const newScore       = curr.score + addedScore;
      const newBoardedLine = edgeType === 'bus' ? lineId : curr.boardedLineId;

      // ── Dominance pruning ────────────────────────────────────────────────
      // Allow a 50% score slack so alternative routes (more transfers but fewer
      // changes, etc.) can still be found for deduplication later.
      const existingBest = getBest(toStopId, newTransfers, newBoardedLine);
      if (newScore >= existingBest * 1.5) continue;
      if (newScore < existingBest) {
        setBest(toStopId, newTransfers, newBoardedLine, newScore);
      }

      heap.push({
        stopId:        toStopId,
        score:         newScore,
        totalTime:     newTotal,
        transfers:     newTransfers,
        fare:          newFare,
        walkMin:       newWalkMin,
        boardedLineId: newBoardedLine,
        prev:          curr,
        prevEdge:      edge,
      });
    }
  }

  if (completedRoutes.length === 0) return [];

  // ── Reconstruct and deduplicate routes ────────────────────────────────────
  const reconstructed = completedRoutes
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)
    .map((label, idx) =>
      reconstructRoute(label, stopMap, lineMap, idx + 1, walkingDestMinutes, originCoords, destCoords)
    );

  return deduplicateRoutes(reconstructed);
}

// ── Route reconstruction ───────────────────────────────────────────────────────
function reconstructRoute(endLabel, stopMap, lineMap, id, finalWalkMin, originCoords, destCoords) {
  // Walk the linked list backwards to collect segments
  const segments = [];
  let node = endLabel;
  while (node && node.prevEdge) {
    segments.unshift({
      fromStopId: node.prev.stopId,
      toStopId:   node.stopId,
      edge:       node.prevEdge,
    });
    node = node.prev;
  }

  // ── Group consecutive same-line bus segments into a single step ────────────
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
        distanceM:   Math.round(edge.travelTime * 60 * 1.1),
      });
      i++;
    } else {
      // Bus: accumulate all consecutive segments on the same line
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
        polyline:     edge.polyline || edge.linePolyline || null,
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

  // ── Append final walking leg to the user's destination ────────────────────
  if (finalWalkMin > 0) {
    const lastSeg  = segments[segments.length - 1];
    const lastStop = stopMap.get(lastSeg?.toStopId);
    steps.push({
      type:        'walk',
      fromStopId:  lastSeg?.toStopId,
      toStopId:    null,
      fromStation: lastStop?.name || '—',
      toStation:   'Destinacioni juaj',
      time:        finalWalkMin,
      distanceM:   Math.round(finalWalkMin * 60 * 1.1),
    });
  }

  // ── Summary badges ────────────────────────────────────────────────────────
  const busSteps = steps.filter(s => s.type === 'bus');
  const busLines = busSteps.map(s => ({
    number: s.lineNumber,
    color:  s.lineColor,
    name:   s.lineName,
  }));

  // Fare: sum all bus-step fares (each step = one boarding event, already
  // deduplicated by the router). Fall back to 40 Lek if none recorded.
  const totalFare = busSteps.reduce((sum, s) => sum + (s.fare || 0), 0) || 40;

  return {
    id,
    totalTime:   endLabel.totalTime,
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
// Keep best-of-four dimensions: score, transfers, walking, fare.
function deduplicateRoutes(routes) {
  if (routes.length === 0) return [];

  const kept = [routes[0]]; // best overall score

  const tryAdd = (candidate) => {
    if (!kept.find(r => r.id === candidate.id)) kept.push(candidate);
  };

  // Fewest transfers (tie-break: time)
  const byTransfers = [...routes].sort((a, b) =>
    a.transfers - b.transfers || a.totalTime - b.totalTime
  );
  tryAdd(byTransfers[0]);

  // Least walking (tie-break: time)
  const byWalk = [...routes].sort((a, b) =>
    a.walkMin - b.walkMin || a.totalTime - b.totalTime
  );
  tryAdd(byWalk[0]);

  // Cheapest fare (tie-break: time)
  const byCheap = [...routes].sort((a, b) =>
    a.fare - b.fare || a.totalTime - b.totalTime
  );
  tryAdd(byCheap[0]);

  const labels = ['Më e shpejta', 'Më pak ndërrime', 'Më pak ecje', 'Çmim i ulët'];
  return kept.slice(0, 4).map((r, i) => ({
    ...r,
    title: labels[i] || `Rruga ${i + 1}`,
    id:    i + 1,
  }));
}

module.exports = { findRoutes };