// netlify/functions/get-lines.js
const { addCorsHeaders, handleCors } = require('./_utils/cors');
const { supabaseAdmin } = require('./_utils/supabase');
const { rateLimit, logSecurityEvent, getClientIp } = require('./_utils/security');

exports.handler = async (event) => {
  const corsResp = handleCors(event);
  if (corsResp) return corsResp;

  if (event.httpMethod !== 'GET') {
    return addCorsHeaders({ statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) });
  }

  const clientIp = getClientIp(event);
  if (!rateLimit(`lines:${clientIp}`, 15, 60 * 1000)) {
    await logSecurityEvent('rate_limit_exceeded', { endpoint: 'get-lines' }, clientIp);
    return addCorsHeaders({ statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) });
  }

  try {
    const { include_stops = 'false' } = event.queryStringParameters || {};

    let query = supabaseAdmin.from('bus_lines').select('*');
    const { data: lines, error } = await query;
    if (error) throw error;

    let result = lines;
    if (include_stops === 'true') {
      // Fetch stop sequences for each line
      const { data: lineStops, error: lsError } = await supabaseAdmin
        .from('bus_line_stops')
        .select('line_id, stop_id, sequence, time_to_next')
        .order('line_id')
        .order('sequence');
      if (lsError) throw lsError;

      // Also get stop coordinates
      const { data: stops, error: stopsError } = await supabaseAdmin
        .from('bus_stops')
        .select('id, lat, lng, name');
      if (stopsError) throw stopsError;
      const stopMap = new Map(stops.map(s => [s.id, s]));

      const stopsByLine = {};
      for (const ls of lineStops) {
        if (!stopsByLine[ls.line_id]) stopsByLine[ls.line_id] = [];
        const stop = stopMap.get(ls.stop_id);
        stopsByLine[ls.line_id].push({
          sequence: ls.sequence,
          stop_id: ls.stop_id,
          name: stop?.name,
          lat: stop?.lat,
          lng: stop?.lng,
          time_to_next: ls.time_to_next,
        });
      }
      result = lines.map(line => ({
        ...line,
        stops: stopsByLine[line.id] || [],
      }));
    }

    await logSecurityEvent('lines_fetched', { count: lines.length }, clientIp);
    return addCorsHeaders({ statusCode: 200, body: JSON.stringify({ lines: result }) });
  } catch (err) {
    console.error(err);
    await logSecurityEvent('api_error', { endpoint: 'get-lines', error: err.message }, clientIp);
    return addCorsHeaders({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};