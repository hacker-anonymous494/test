// netlify/functions/_utils/graph-builder.js
// ============================================================
// Transit Graph Builder — Production Grade
// Builds an in-memory adjacency list from Supabase data.
// Called once per cold start then cached in module scope.
// ============================================================

'use strict';

const { supabaseAdmin } = require('./supabase');

// ── Constants ────────────────────────────────────────────────────────────────
const WALK_SPEED_MPS   = 1.1;   // metres per second (comfortable pace)
const MAX_WALK_M       = 600;   // maximum walking transfer distance
const TRANSFER_MIN     = 3;     // minutes penalty per transfer (boarding time)

// ── Module-level cache ───────────────────────────────────────────────────────
let _cachedGraph  = null;
let _cacheBuiltAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Returns a transit graph, refreshing from DB if cache is stale.
 * @returns {Promise<{graph: Object, stops: Map, lines: Map, schedules: Map}>}
 */
async function getTransitGraph() {
  const now = Date.now();
  if (_cachedGraph && now - _cacheBuiltAt < CACHE_TTL_MS) {
    return _cachedGraph;
  }
  _cachedGraph  = await buildTransitGraph();
  _cacheBuiltAt = Date.now();
  return _cachedGraph;
}

// ── Internal builder ──────────────────────────────────────────────────────────
async function buildTransitGraph() {
  const [stopsResult, lineStopsResult, walkResult, schedResult] = await Promise.all([
    supabaseAdmin.from('bus_stops').select('id, name, lat, lng, is_accessible, zone_id'),
    supabaseAdmin.from('bus_line_stops')
      .select(`
        id, line_id, stop_id, sequence, time_to_next,
        line:bus_lines(id, line_number, name, direction, is_circular, is_directional,
                       base_fare_lek, color_hex, is_accessible, schedule_start, schedule_end,
                       headway_minutes)
      `)
      .order('line_id')
      .order('sequence'),
    supabaseAdmin.from('walking_connections')
      .select('from_stop_id, to_stop_id, walking_time, distance_meters'),
    supabaseAdmin.from('line_schedules')
      .select('line_id, day_type, first_departure, last_departure, headway_minutes'),
  ]);

  if (stopsResult.error)    throw new Error('stops query: '    + stopsResult.error.message);
  if (lineStopsResult.error) throw new Error('lineStops query: ' + lineStopsResult.error.message);

  const stops     = stopsResult.data;
  const lineStops = lineStopsResult.data;
  const walks     = walkResult.data     || [];
  const schedules = schedResult.data    || [];

  // ── Stop lookup map ─────────────────────────────────────────────────────────
  /** @type {Map<number, Object>} */
  const stopMap = new Map(stops.map(s => [s.id, s]));

  // ── Schedule lookup: lineId → dayType → schedule ────────────────────────────
  /** @type {Map<number, Object>} */
  const scheduleMap = new Map();
  for (const sch of schedules) {
    if (!scheduleMap.has(sch.line_id)) scheduleMap.set(sch.line_id, {});
    scheduleMap.get(sch.line_id)[sch.day_type] = sch;
  }

  // ── Lines meta lookup ───────────────────────────────────────────────────────
  const lineMap = new Map();
  for (const ls of lineStops) {
    if (ls.line) lineMap.set(ls.line_id, ls.line);
  }

  // ── Build adjacency list ────────────────────────────────────────────────────
  // graph[stopId] = Array<Edge>
  // Edge = { toStopId, travelTime, lineId, lineNumber, lineName, lineColor,
  //          fare, edgeType, isAccessible }
  const graph = {};
  for (const s of stops) graph[s.id] = [];

  // Group bus_line_stops by line
  const byLine = new Map();
  for (const ls of lineStops) {
    if (!byLine.has(ls.line_id)) byLine.set(ls.line_id, []);
    byLine.get(ls.line_id).push(ls);
  }

  for (const [lineId, segs] of byLine.entries()) {
    segs.sort((a, b) => a.sequence - b.sequence);
    const lineMeta   = lineMap.get(lineId);
    if (!lineMeta) continue;

    const isCircular    = lineMeta.is_circular   || false;
    const isDirectional = lineMeta.is_directional !== false; // default true

    for (let i = 0; i < segs.length - 1; i++) {
      const cur  = segs[i];
      const next = segs[i + 1];
      const travelTime = cur.time_to_next;
      if (!travelTime || travelTime <= 0) continue;

      if (!graph[cur.stop_id])  graph[cur.stop_id]  = [];
      if (!graph[next.stop_id]) graph[next.stop_id] = [];

      const baseEdge = {
        lineId,
        lineNumber:   lineMeta.line_number,
        lineName:     lineMeta.name,
        lineColor:    lineMeta.color_hex || '#1a73e8',
        fare:         lineMeta.base_fare_lek || 40,
        edgeType:     'bus',
        isAccessible: lineMeta.is_accessible || false,
      };

      // Forward edge
      graph[cur.stop_id].push({
        ...baseEdge,
        toStopId:   next.stop_id,
        travelTime,
        direction: 'forward',
      });

      // Reverse edge — only for non-directional or circular lines
      if (!isDirectional || isCircular) {
        graph[next.stop_id].push({
          ...baseEdge,
          toStopId:   cur.stop_id,
          travelTime,
          direction: 'backward',
        });
      }
    }

    // Circular: connect last → first
    if (isCircular && segs.length >= 2) {
      const last  = segs[segs.length - 1];
      const first = segs[0];
      const travelTime = last.time_to_next || 5;
      const baseMeta = { ...lineMap.get(lineId) };
      graph[last.stop_id]?.push({
        toStopId:    first.stop_id,
        travelTime,
        lineId,
        lineNumber:  lineMeta.line_number,
        lineName:    lineMeta.name,
        lineColor:   lineMeta.color_hex || '#1a73e8',
        fare:        lineMeta.base_fare_lek || 40,
        edgeType:    'bus',
        isAccessible: lineMeta.is_accessible || false,
        direction:   'circular',
      });
    }
  }

  // ── Walking edges ───────────────────────────────────────────────────────────
  for (const w of walks) {
    if (!graph[w.from_stop_id]) graph[w.from_stop_id] = [];
    if (!graph[w.to_stop_id])   graph[w.to_stop_id]   = [];

    const walkEdge = {
      toStopId:     w.to_stop_id,
      travelTime:   w.walking_time || Math.ceil(w.distance_meters / WALK_SPEED_MPS / 60),
      lineId:       null,
      lineNumber:   null,
      lineName:     null,
      lineColor:    '#34A853',
      fare:         0,
      edgeType:     'walk',
      isAccessible: true,
      direction:    'both',
    };
    graph[w.from_stop_id].push(walkEdge);
    // walking is bidirectional
    graph[w.to_stop_id].push({ ...walkEdge, toStopId: w.from_stop_id });
  }

  return { graph, stopMap, lineMap, scheduleMap };
}

// ── Nearby stops finder ────────────────────────────────────────────────────────
/**
 * Returns all stops within `maxDistanceM` metres of (lat, lng),
 * sorted ascending by distance, with a walking time estimate.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {Map}    stopMap  – from buildTransitGraph
 * @param {number} maxDistanceM
 * @returns {Array<{stop, distanceM, walkingMinutes}>}
 */
function findNearbyStops(lat, lng, stopMap, maxDistanceM = MAX_WALK_M) {
  const results = [];
  for (const stop of stopMap.values()) {
    if (stop.lat == null || stop.lng == null) continue;
    const d = haversineMetres(lat, lng, stop.lat, stop.lng);
    if (d <= maxDistanceM) {
      results.push({
        stop,
        distanceM:     Math.round(d),
        walkingMinutes: Math.ceil(d / WALK_SPEED_MPS / 60),
      });
    }
  }
  results.sort((a, b) => a.distanceM - b.distanceM);
  return results;
}

// ── Haversine distance ────────────────────────────────────────────────────────
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Wait time calculator ──────────────────────────────────────────────────────
/**
 * Expected waiting time in minutes for a given line at a given clock time.
 *
 * @param {number}  lineId
 * @param {Date}    departureTime
 * @param {Map}     scheduleMap
 * @param {Map}     lineMap
 * @returns {number} waiting minutes
 */
function calcWaitMinutes(lineId, departureTime, scheduleMap, lineMap) {
  const DOW      = departureTime.getDay(); // 0=Sun,6=Sat
  const dayType  = DOW === 0 ? 'sunday' : DOW === 6 ? 'saturday' : 'weekday';
  const lineSched = scheduleMap.get(lineId)?.[dayType];
  const line      = lineMap.get(lineId);

  let headway = lineSched?.headway_minutes || line?.headway_minutes || 15;

  // Check if bus is operating
  if (lineSched) {
    const [fh, fm] = lineSched.first_departure.split(':').map(Number);
    const [lh, lm] = lineSched.last_departure.split(':').map(Number);
    const nowM     = departureTime.getHours() * 60 + departureTime.getMinutes();
    const firstM   = fh * 60 + fm;
    const lastM    = lh * 60 + lm;
    if (nowM < firstM || nowM > lastM) {
      return Infinity; // line not operating
    }
  }

  // Expected wait = headway / 2 (uniform arrival assumption)
  return headway / 2;
}

module.exports = {
  getTransitGraph,
  findNearbyStops,
  calcWaitMinutes,
  haversineMetres,
  TRANSFER_MIN,
};
