// netlify/functions/_utils/router.js
// ============================================================
// Transit Routing Engine — Multi-Criteria Dijkstra
// Finds up to 4 distinct route variants:
//   fastest   – minimise total time (ride + wait + walk)
//   comfort   – minimise transfers
//   cheapest  – minimise fare (+ reasonable time)
//   walking   – minimise walking distance
//
// Algorithm: label-correcting multi-criteria Dijkstra
// Handles: directional lines, walking transfers, transfer
//          penalties, wait times, cycle avoidance.
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

const MAX_TRANSFERS  = 4;
const MAX_WALK_MIN   = 20;   // hard cap on a single walking leg

// ── Main entry point ─────────────────────────────────────────────────────────
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
    searchType  = 'fastest',
    accessibleOnly = false,
    walkingOriginMinutes  = 0,
    walkingDestMinutes    = 0,
    originCoords,
    destCoords,
  } = opts;

  const weights = WEIGHTS[searchType] || WEIGHTS.fastest;
  const destSet = new Set(destStopIds);

  // ── Labels: stopId → best label per (lineId | 'walk') ─────────────────────
  // label = { score, totalTime, transfers, fare, walkMin, prev, prevLine, arrivalTime }
  const bestScore = {}; // stopId → best composite score reached so far
  for (const id in graph) bestScore[id] = Infinity;

  // Priority queue: simple sorted array (adequate for city-scale graphs ~300 stops)
  // For 1000+ stops, swap in a proper binary heap.
  const queue = [];

  // Seed: all origin stops (user walks to each)
  for (const sid of originStopIds) {
    const walkMin = walkingOriginMinutes; // set per origin, or use 0 for nearest
    const label   = {
      stopId:     sid,
      score:      weights.walk * walkMin,
      totalTime:  walkMin,
      transfers:  0,
      fare:       0,
      walkMin,
      boardedLineId: null,
      prev:       null,
      prevEdge:   null,
      visitedStops: new Set([sid]),
    };
    queue.push(label);
    bestScore[sid] = label.score;
  }

  const completedRoutes = [];
  const seenDestSignatures = new Set();

  while (queue.length > 0) {
    // Pop best
    queue.sort((a, b) => a.score - b.score);
    const curr = queue.shift();

    // ── Destination reached ────────────────────────────────────────────────
    if (destSet.has(curr.stopId)) {
      const finalWalk    = walkingDestMinutes;
      const finalTime    = curr.totalTime + finalWalk;
      const finalScore   = curr.score + weights.walk * finalWalk;
      const sig          = `${curr.stopId}:${curr.transfers}:${curr.boardedLineId}`;

      if (!seenDestSignatures.has(sig)) {
        seenDestSignatures.add(sig);
        completedRoutes.push({
          ...curr,
          totalTime:  finalTime,
          score:      finalScore,
          walkMinFinal: finalWalk,
        });
      }
      // Keep searching for alternatives (up to limit)
      if (completedRoutes.length >= 6) break;
      continue;
    }

    // ── Prune: too many transfers ──────────────────────────────────────────
    if (curr.transfers > MAX_TRANSFERS) continue;

    // ── Expand edges ───────────────────────────────────────────────────────
    const edges = graph[curr.stopId] || [];
    for (const edge of edges) {
      const { toStopId, travelTime, edgeType, lineId, isAccessible, fare } = edge;

      // Accessibility filter
      if (accessibleOnly && !isAccessible) continue;

      // Cycle avoidance
      if (curr.visitedStops.has(toStopId)) continue;

      // Walking cap
      if (edgeType === 'walk' && travelTime > MAX_WALK_MIN) continue;

      // Is this a transfer (switching lines)?
      const isTransfer = (
        edgeType === 'bus' &&
        curr.boardedLineId !== null &&
        curr.boardedLineId !== lineId
      );
      const newTransfers = curr.transfers + (isTransfer ? 1 : 0);
      if (newTransfers > MAX_TRANSFERS) continue;

      // Wait time for bus edges
      let waitMin = 0;
      if (edgeType === 'bus' && (curr.boardedLineId !== lineId)) {
        // Boarding a (new) line — pay waiting cost
        waitMin = calcWaitMinutes(lineId, departureTime, scheduleMap, lineMap);
        if (waitMin === Infinity) continue; // line not running
      }

      // Transfer penalty
      const transferPenalty = isTransfer ? TRANSFER_MIN : 0;

      const addedTime   = waitMin + travelTime + transferPenalty;
      const newWalkMin  = edgeType === 'walk' ? curr.walkMin + travelTime : curr.walkMin;
      const newFare     = curr.fare + (isTransfer ? fare : edgeType === 'bus' && curr.boardedLineId === null ? fare : 0);
      const newTotal    = curr.totalTime + addedTime;

      const addedScore  =
        weights.time      * addedTime +
        weights.walk      * (edgeType === 'walk' ? travelTime : 0) +
        weights.transfers * (isTransfer ? 1 : 0) +
        weights.fare      * (isTransfer ? fare : 0);

      const newScore = curr.score + addedScore;

      // Prune dominated labels
      if (newScore >= (bestScore[toStopId] ?? Infinity) * 1.5) continue;
      if (newScore < (bestScore[toStopId] ?? Infinity)) {
        bestScore[toStopId] = newScore;
      }

      const newVisited = new Set(curr.visitedStops);
      newVisited.add(toStopId);

      queue.push({
        stopId:        toStopId,
        score:         newScore,
        totalTime:     newTotal,
        transfers:     newTransfers,
        fare:          newFare,
        walkMin:       newWalkMin,
        boardedLineId: edgeType === 'bus' ? lineId : curr.boardedLineId,
        prev:          curr,
        prevEdge:      edge,
        visitedStops:  newVisited,
      });
    }
  }

  if (completedRoutes.length === 0) return [];

  // ── Reconstruct and deduplicate routes ────────────────────────────────────
  const reconstructed = completedRoutes
    .sort((a, b) => a.score - b.score)
    .slice(0, 6)
    .map((label, idx) => reconstructRoute(label, stopMap, lineMap, idx + 1, walkingDestMinutes, originCoords, destCoords));

  // Return distinct variants
  return deduplicateRoutes(reconstructed);
}

// ── Route reconstruction ───────────────────────────────────────────────────────
function reconstructRoute(endLabel, stopMap, lineMap, id, finalWalkMin, originCoords, destCoords) {
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

  // Group consecutive same-line bus segments
  const steps = [];
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
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
      // Bus: accumulate until line changes
      const lineId     = edge.lineId;
      const lineNumber = edge.lineNumber;
      const lineName   = edge.lineName;
      const lineColor  = edge.lineColor;
      const fare       = edge.fare;
      let   rideTime   = edge.travelTime;
      const fromStop   = stopMap.get(seg.fromStopId);
      let   toStop     = stopMap.get(seg.toStopId);
      const stopSequence = [fromStop?.name || '—', toStop?.name || '—'];

      let j = i + 1;
      while (j < segments.length && segments[j].edge.edgeType === 'bus' && segments[j].edge.lineId === lineId) {
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
        fromStopId:   seg.fromStopId,
        toStopId:     segments[j-1].toStopId,
        fromStation:  fromStop?.name || '—',
        toStation:    toStop?.name   || '—',
        stopSequence,
        time:         rideTime,
      });
      i = j;
    }
  }

  // Prepend walking to first stop if needed
  const firstSeg = segments[0];
  if (firstSeg && originCoords) {
    const fromStop = stopMap.get(firstSeg.fromStopId);
    // Walk leg only if first edge is not already a walk
    if (firstSeg.edge.edgeType !== 'walk' && endLabel.walkMin > 0) {
      // already accounted for in score; add as walk step if > 0 min
    }
  }

  // Append final walk if needed
  if (finalWalkMin > 0 && destCoords) {
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

  // Compute line badges for summary
  const busLines = steps
    .filter(s => s.type === 'bus')
    .map(s => ({ number: s.lineNumber, color: s.lineColor, name: s.lineName }));

  const totalFare = steps
    .filter(s => s.type === 'bus')
    .reduce((sum, s, idx) => sum + (idx === 0 ? s.fare : (endLabel.transfers > 0 ? s.fare : 0)), 0);

  return {
    id,
    totalTime:   endLabel.totalTime,
    score:       endLabel.score,
    transfers:   endLabel.transfers,
    fare:        totalFare || 40,
    walkMin:     endLabel.walkMin + (finalWalkMin || 0),
    steps,
    busLines,
    fromStation: steps[0]?.fromStation || '—',
    toStation:   steps[steps.length - 1]?.toStation || '—',
  };
}

// ── Deduplication — keep best of fastest/fewest-transfers/least-walking ───────
function deduplicateRoutes(routes) {
  if (routes.length === 0) return [];

  // Always include the top-scored route
  const kept = [routes[0]];

  // Fewest transfers
  const byTransfers = [...routes].sort((a, b) => a.transfers - b.transfers || a.totalTime - b.totalTime);
  if (byTransfers[0].id !== kept[0].id) kept.push(byTransfers[0]);

  // Least walking
  const byWalk = [...routes].sort((a, b) => a.walkMin - b.walkMin || a.totalTime - b.totalTime);
  const leastWalk = byWalk[0];
  if (!kept.find(r => r.id === leastWalk.id)) kept.push(leastWalk);

  // Cheapest
  const byCheap = [...routes].sort((a, b) => a.fare - b.fare || a.totalTime - b.totalTime);
  const cheapest = byCheap[0];
  if (!kept.find(r => r.id === cheapest.id)) kept.push(cheapest);

  // Re-tag variants with labels
  const labels = ['Më e shpejta', 'Më pak ndërrime', 'Më pak ecje', 'Çmim i ulët'];
  return kept.slice(0, 4).map((r, i) => ({
    ...r,
    title:  labels[i] || `Rruga ${i + 1}`,
    id:     i + 1,
  }));
}

module.exports = { findRoutes };
