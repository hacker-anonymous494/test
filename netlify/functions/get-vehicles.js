// netlify/functions/get-vehicles.js
const { addCorsHeaders, handleCors } = require('./_utils/cors');
const { supabaseAdmin } = require('./_utils/supabase');
const { rateLimit, logSecurityEvent, getClientIp } = require('./_utils/security');

// Simple linear interpolation between two points
function interpolatePoint(p1, p2, fraction) {
  return {
    lat: p1.lat + (p2.lat - p1.lat) * fraction,
    lng: p1.lng + (p2.lng - p1.lng) * fraction,
  };
}

exports.handler = async (event) => {
  const corsResp = handleCors(event);
  if (corsResp) return corsResp;

  if (event.httpMethod !== 'GET') {
    return addCorsHeaders({ statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) });
  }

  const clientIp = getClientIp(event);
  if (!rateLimit(`vehicles:${clientIp}`, 30, 60 * 1000)) {
    await logSecurityEvent('rate_limit_exceeded', { endpoint: 'get-vehicles' }, clientIp);
    return addCorsHeaders({ statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) });
  }

  try {
    // First try to fetch real live vehicles
    let { data: vehicles, error } = await supabaseAdmin
      .from('live_vehicles')
      .select('*, line:line_id(line_number, name, color_hex)');
    if (error) throw error;

    // If no live data, generate simulated vehicles (optional)
    if (!vehicles || vehicles.length === 0) {
      // Fetch all lines and their stop coordinates
      const { data: lines, error: linesErr } = await supabaseAdmin
        .from('bus_lines')
        .select('id, line_number, name, color_hex');
      if (linesErr) throw linesErr;

      const { data: lineStops, error: stopsErr } = await supabaseAdmin
        .from('bus_line_stops')
        .select('line_id, stop_id, sequence')
        .order('line_id')
        .order('sequence');
      if (stopsErr) throw stopsErr;

      const { data: stops, error: stopsCoordErr } = await supabaseAdmin
        .from('bus_stops')
        .select('id, lat, lng');
      if (stopsCoordErr) throw stopsCoordErr;
      const stopCoordMap = new Map(stops.map(s => [s.id, { lat: s.lat, lng: s.lng }]));

      // Group stops by line
      const stopsByLine = new Map();
      for (const ls of lineStops) {
        if (!stopsByLine.has(ls.line_id)) stopsByLine.set(ls.line_id, []);
        const coord = stopCoordMap.get(ls.stop_id);
        if (coord) stopsByLine.get(ls.line_id).push(coord);
      }

      // Generate one fake vehicle per line, positioned at 30% along the route
      const now = Date.now();
      vehicles = [];
      for (const line of lines) {
        const lineStopsCoords = stopsByLine.get(line.id) || [];
        if (lineStopsCoords.length < 2) continue;
        // Use time to simulate movement: every call advances position by 0.5%
        const offset = (now % 60000) / 60000; // 0..1 over 60 seconds
        const segmentCount = lineStopsCoords.length - 1;
        const segIndex = Math.floor(offset * segmentCount);
        const segProgress = (offset * segmentCount) - segIndex;
        const from = lineStopsCoords[segIndex];
        const to = lineStopsCoords[segIndex + 1];
        const pos = interpolatePoint(from, to, segProgress);
        vehicles.push({
          id: line.id * 1000,
          line_id: line.id,
          lat: pos.lat,
          lng: pos.lng,
          heading: 0,
          speed: 30,
          updated_at: new Date().toISOString(),
          line: { line_number: line.line_number, name: line.name, color_hex: line.color_hex },
        });
      }
    }

    await logSecurityEvent('vehicles_fetched', { count: vehicles.length, simulated: vehicles.length > 0 }, clientIp);
    return addCorsHeaders({ statusCode: 200, body: JSON.stringify({ vehicles }) });
  } catch (err) {
    console.error(err);
    await logSecurityEvent('api_error', { endpoint: 'get-vehicles', error: err.message }, clientIp);
    return addCorsHeaders({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};