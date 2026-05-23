// netlify/functions/delete-saved-route.js
const { addCorsHeaders, handleCors } = require('./_utils/cors');
const { supabaseAdmin } = require('./_utils/supabase');
const { rateLimit, logSecurityEvent, getClientIp } = require('./_utils/security');

exports.handler = async (event) => {
  const corsResp = handleCors(event);
  if (corsResp) return corsResp;

  if (event.httpMethod !== 'DELETE') {
    return addCorsHeaders({ statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) });
  }

  const clientIp = getClientIp(event);
  if (!rateLimit(`delete-route:${clientIp}`, 10, 60 * 1000)) {
    await logSecurityEvent('rate_limit_exceeded', { endpoint: 'delete-saved-route' }, clientIp);
    return addCorsHeaders({ statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) });
  }

  const authHeader = event.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return addCorsHeaders({ statusCode: 401, body: JSON.stringify({ error: 'Missing token' }) });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    return addCorsHeaders({ statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) });
  }

  const { id } = event.queryStringParameters || {};
  if (!id) {
    return addCorsHeaders({ statusCode: 400, body: JSON.stringify({ error: 'Missing route id' }) });
  }

  try {
    // Verify ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('saved_routes')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (fetchError || !existing) {
      return addCorsHeaders({ statusCode: 404, body: JSON.stringify({ error: 'Route not found' }) });
    }

    const { error } = await supabaseAdmin.from('saved_routes').delete().eq('id', id);
    if (error) throw error;

    await logSecurityEvent('route_deleted', { route_id: id }, clientIp, user.id);
    return addCorsHeaders({ statusCode: 200, body: JSON.stringify({ success: true }) });
  } catch (err) {
    console.error(err);
    return addCorsHeaders({ statusCode: 500, body: JSON.stringify({ error: 'Failed to delete route' }) });
  }
};