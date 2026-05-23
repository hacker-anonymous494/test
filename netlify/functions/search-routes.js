// netlify/functions/search-routes.js
// ============================================================
// Transit Route Search — Production Endpoint
// POST /.netlify/functions/search-routes
//
// Body (JSON):
//   fromLat, fromLng, toLat, toLng  (required)
//   searchType    'fastest'|'comfort'|'cheapest'|'walking'|'accessible'
//   departureTime ISO 8601 string (defaults to now)
//   maxWalkingMin integer (default 12)
//   accessibleOnly boolean
// ============================================================

'use strict';

const { addCorsHeaders, handleCors } = require('./_utils/cors');
const { supabaseAdmin }              = require('./_utils/supabase');
const { getTransitGraph, findNearbyStops, haversineMetres } = require('./_utils/graph-builder');
const { findRoutes }                 = require('./_utils/router');

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_WALK_MIN        = 15;   // default max user walking
const MAX_ORIGIN_STOPS    = 5;    // evaluate N nearest origin stops
const MAX_DEST_STOPS      = 5;
const CACHE_WINDOW_MINUTES = 10;  // route_cache bucket size

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // CORS preflight
  const corsResp = handleCors(event, (err, res) => res);
  if (corsResp) return corsResp;

  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' }, event);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON body' }, event);
  }

  const {
    fromLat, fromLng, toLat, toLng,
    searchType      = 'fastest',
    departureTime: deptStr,
    maxWalkingMin   = MAX_WALK_MIN,
    accessibleOnly  = false,
  } = body;

  if (!fromLat || !fromLng || !toLat || !toLng) {
    return respond(400, { error: 'Missing required coordinates' }, event);
  }

  const departureTime = deptStr ? new Date(deptStr) : new Date();
  if (isNaN(departureTime.getTime())) {
    return respond(400, { error: 'Invalid departureTime' }, event);
  }

  // ── Cache check ─────────────────────────────────────────────────────────────
  // We cache at stop-pair level with a 10-minute window.
  // (Coordinates are too granular to cache; we cache after stop resolution.)
  // Cache check happens after stop resolution below.

  try {
    // ── 1. Load transit graph (cached) ───────────────────────────────────────
    const { graph, stopMap, lineMap, scheduleMap } = await getTransitGraph();

    // ── 2. Find nearby stops for origin & destination ────────────────────────
    // Convert maxWalkingMin → metres: walking speed 1.1 m/s × 60 s/min = 66 m/min
    const maxWalkM   = maxWalkingMin * 66;
    const nearOrigin = findNearbyStops(fromLat, fromLng, stopMap, maxWalkM)
      .slice(0, MAX_ORIGIN_STOPS);
    const nearDest   = findNearbyStops(toLat, toLng, stopMap, maxWalkM)
      .slice(0, MAX_DEST_STOPS);

    if (nearOrigin.length === 0) {
      return respond(404, { error: 'Nuk u gjet asnjë stacion autobusi pranë pikës së nisjes.' }, event);
    }
    if (nearDest.length === 0) {
      return respond(404, { error: 'Nuk u gjet asnjë stacion autobusi pranë destinacionit.' }, event);
    }

    // ── 3. Cache lookup ──────────────────────────────────────────────────────
    const primaryOriginId = nearOrigin[0].stop.id;
    const primaryDestId   = nearDest[0].stop.id;
    const hourBucket      = departureTime.getHours();

    const { data: cachedRows } = await supabaseAdmin
      .from('route_cache')
      .select('route_data')
      .eq('start_stop_id', primaryOriginId)
      .eq('end_stop_id',   primaryDestId)
      .eq('search_type',   searchType)
      .eq('hour_bucket',   hourBucket)
      .gt('expires_at',    new Date().toISOString())
      .limit(1);

    if (cachedRows && cachedRows.length > 0) {
      return respond(200, cachedRows[0].route_data, event);
    }

    // ── 4. Run routing algorithm ─────────────────────────────────────────────
    const originStopIds = nearOrigin.map(n => n.stop.id);
    const destStopIds   = nearDest.map(n => n.stop.id);

    // Use walking time to nearest stop as initial walk penalty
    const walkToOrigin = nearOrigin[0].walkingMinutes;
    const walkToDest   = nearDest[0].walkingMinutes;

    const routes = findRoutes({
      originStopIds,
      destStopIds,
      graph,
      stopMap,
      lineMap,
      scheduleMap,
      departureTime,
      searchType,
      accessibleOnly,
      walkingOriginMinutes: walkToOrigin,
      walkingDestMinutes:   walkToDest,
      originCoords: { lat: fromLat, lng: fromLng },
      destCoords:   { lat: toLat,   lng: toLng },
    });

    if (routes.length === 0) {
      return respond(404, {
        error: 'Nuk u gjet asnjë rrugë. Provoni të rrisni kohën maksimale të ecjes ose ndërrimi.',
      }, event);
    }

    // ── 5. Enrich routes with polyline coords ────────────────────────────────
    const enriched = await enrichWithPolylines(routes, stopMap);

    // ── 6. Build response ────────────────────────────────────────────────────
    const result = {
      results:     enriched,
      meta: {
        originStops:  nearOrigin.slice(0, 2).map(n => ({ id: n.stop.id, name: n.stop.name, distanceM: n.distanceM, coords: { lat: n.stop.lat, lng: n.stop.lng } })),
        destStops:    nearDest.slice(0, 2).map(n => ({ id: n.stop.id, name: n.stop.name, distanceM: n.distanceM, coords: { lat: n.stop.lat, lng: n.stop.lng } })),
        departureTime: departureTime.toISOString(),
        searchType,
      },
    };

    // ── 7. Save to cache ─────────────────────────────────────────────────────
    const expiresAt = new Date(Date.now() + CACHE_WINDOW_MINUTES * 60 * 1000).toISOString();
    supabaseAdmin.from('route_cache').insert({
      start_stop_id: primaryOriginId,
      end_stop_id:   primaryDestId,
      search_type:   searchType,
      hour_bucket:   hourBucket,
      expires_at:    expiresAt,
      route_data:    result,
    }).then(() => {}).catch(() => {}); // fire-and-forget

    return respond(200, result, event);

  } catch (err) {
    console.error('[search-routes] Error:', err);
    return respond(500, { error: err.message || 'Internal server error' }, event);
  }
};

// ── Enrich routes with stop coordinates for polyline rendering ────────────────
async function enrichWithPolylines(routes, stopMap) {
  return routes.map(route => ({
    ...route,
    steps: route.steps.map(step => {
      const from = stopMap.get(step.fromStopId);
      const to   = stopMap.get(step.toStopId);
      return {
        ...step,
        fromCoords: from ? { lat: from.lat, lng: from.lng } : null,
        toCoords:   to   ? { lat: to.lat,   lng: to.lng }   : null,
        polyline:  step.linePolyline || null,
      };
    }),
  }));
}

// ── Helper ─────────────────────────────────────────────────────────────────────
function respond(statusCode, body, event) {
  return addCorsHeaders({ statusCode, body: JSON.stringify(body) }, event);
}