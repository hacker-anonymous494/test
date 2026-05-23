// netlify/functions/get-saved-routes.js
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
  if (!rateLimit(`get-saved-routes:${clientIp}`, 20, 60 * 1000)) {
    await logSecurityEvent('rate_limit_exceeded', { endpoint: 'get-saved-routes' }, clientIp);
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

  try {
    const { data, error } = await supabaseAdmin
      .from('saved_routes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return addCorsHeaders({ statusCode: 200, body: JSON.stringify({ savedRoutes: data }) });
  } catch (err) {
    console.error(err);
    return addCorsHeaders({ statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch saved routes' }) });
  }
};