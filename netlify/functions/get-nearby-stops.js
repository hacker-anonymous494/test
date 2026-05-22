// netlify/functions/get-nearby-stops.js
const { addCorsHeaders, handleCors } = require('./_utils/cors');
const { supabaseAdmin } = require('./_utils/supabase');
const { rateLimit, logSecurityEvent, getClientIp } = require('./_utils/security');
const { haversineMetres } = require('./_utils/graph-builder'); // reuse existing

exports.handler = async (event) => {
  const corsResp = handleCors(event);
  if (corsResp) return corsResp;

  if (event.httpMethod !== 'GET') {
    return addCorsHeaders({ statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) });
  }

  const clientIp = getClientIp(event);
  if (!rateLimit(`nearby:${clientIp}`, 20, 60 * 1000)) {
    await logSecurityEvent('rate_limit_exceeded', { endpoint: 'get-nearby-stops' }, clientIp);
    return addCorsHeaders({ statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) });
  }

  const { lat, lng, radius = 500, limit = 20 } = event.queryStringParameters || {};
  if (!lat || !lng) {
    return addCorsHeaders({ statusCode: 400, body: JSON.stringify({ error: 'Missing lat/lng' }) });
  }

  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);
  if (isNaN(userLat) || isNaN(userLng)) {
    return addCorsHeaders({ statusCode: 400, body: JSON.stringify({ error: 'Invalid lat/lng' }) });
  }

  try {
    // Fetch all stops (we'll filter by distance on server – for large datasets use PostGIS, but this is fine for ~500 stops)
    const { data: allStops, error } = await supabaseAdmin.from('bus_stops').select('*');
    if (error) throw error;

    const nearby = allStops
      .map(stop => ({
        ...stop,
        distanceM: haversineMetres(userLat, userLng, stop.lat, stop.lng),
      }))
      .filter(s => s.distanceM <= radius)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, parseInt(limit));

    await logSecurityEvent('nearby_stops_fetched', { lat, lng, radius, count: nearby.length }, clientIp);
    return addCorsHeaders({ statusCode: 200, body: JSON.stringify({ stops: nearby }) });
  } catch (err) {
    console.error(err);
    await logSecurityEvent('api_error', { endpoint: 'get-nearby-stops', error: err.message }, clientIp);
    return addCorsHeaders({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) });
  }
};