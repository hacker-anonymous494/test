// netlify/functions/get-stops.js
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
  const identifier = `stops:${clientIp}`;
  if (!rateLimit(identifier, 20, 60 * 1000)) {
    await logSecurityEvent('rate_limit_exceeded', { endpoint: 'get-stops' }, clientIp);
    return addCorsHeaders({ statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) });
  }

  try {
    const { line_id, search, limit = 100 } = event.queryStringParameters || {};

    let query = supabaseAdmin.from('bus_stops').select('*');
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    if (line_id) {
      // First get stop ids for that line
      const { data: lineStops, error: lineStopError } = await supabaseAdmin
        .from('bus_line_stops')
        .select('stop_id')
        .eq('line_id', line_id);
      if (lineStopError) throw lineStopError;
      const stopIds = lineStops.map(ls => ls.stop_id);
      if (stopIds.length) query = query.in('id', stopIds);
      else query = query.limit(0);
    }
    const { data, error } = await query.limit(parseInt(limit));
    if (error) throw error;

    await logSecurityEvent('stops_fetched', { count: data.length }, clientIp);
    return addCorsHeaders({ statusCode: 200, body: JSON.stringify({ stops: data }) });
  } catch (err) {
    console.error(err);
    await logSecurityEvent('api_error', { endpoint: 'get-stops', error: err.message }, clientIp);
    return addCorsHeaders({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};