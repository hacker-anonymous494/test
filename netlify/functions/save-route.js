// netlify/functions/save-route.js
const { addCorsHeaders, handleCors } = require('./_utils/cors');
const { supabaseAdmin } = require('./_utils/supabase');
const { rateLimit, logSecurityEvent, getClientIp } = require('./_utils/security');

exports.handler = async (event) => {
  const corsResp = handleCors(event);
  if (corsResp) return corsResp;

  if (event.httpMethod !== 'POST') {
    return addCorsHeaders({ statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) });
  }

  const clientIp = getClientIp(event);
  // Rate limit per IP
  if (!rateLimit(`save-route:${clientIp}`, 10, 60 * 1000)) {
    await logSecurityEvent('rate_limit_exceeded', { endpoint: 'save-route' }, clientIp);
    return addCorsHeaders({ statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) });
  }

  // Get user from JWT
  const authHeader = event.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return addCorsHeaders({ statusCode: 401, body: JSON.stringify({ error: 'Missing or invalid token' }) });
  }
  const token = authHeader.split(' ')[1];

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    await logSecurityEvent('invalid_token', { error: userError?.message }, clientIp);
    return addCorsHeaders({ statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return addCorsHeaders({ statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) });
  }

  const { name, fromLocation, toLocation, routeData } = body;
  if (!name || !fromLocation || !toLocation || !routeData) {
    return addCorsHeaders({ statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('saved_routes')
      .insert({
        user_id: user.id,
        from_location: fromLocation,
        to_location: toLocation,
        route_data: routeData,
      })
      .select()
      .single();

    if (error) throw error;

    await logSecurityEvent('route_saved', { route_id: data.id }, clientIp, user.id);
    return addCorsHeaders({ statusCode: 200, body: JSON.stringify({ success: true, savedRoute: data }) });
  } catch (err) {
    console.error(err);
    await logSecurityEvent('save_route_error', { error: err.message }, clientIp, user.id);
    return addCorsHeaders({ statusCode: 500, body: JSON.stringify({ error: 'Failed to save route' }) });
  }
};