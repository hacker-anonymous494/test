// netlify/functions/live-vehicles.js
'use strict';

const { supabaseAdmin } = require('./_utils/supabase');
const { addCorsHeaders, handleCors } = require('./_utils/cors');

// Decode Google polyline (longitude‑first)
function decodeEncodedPolyline(encoded) {
  if (!encoded) return [];
  let idx = 0, lat = 0, lng = 0;
  const points = [];
  while (idx < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return points;
}

// Parse shape_encoded (JSON array or encoded polyline)
function getRoutePoints(shapeEncoded) {
  if (!shapeEncoded) return [];
  if (typeof shapeEncoded === 'string' && shapeEncoded.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(shapeEncoded);
      if (Array.isArray(arr) && arr.length && Array.isArray(arr[0])) {
        return arr.map(p => ({ lat: p[0], lng: p[1] }));
      }
    } catch (e) {}
  }
  return decodeEncodedPolyline(shapeEncoded);
}

// Get point at fraction (0..1) along polyline
function getPointAtFraction(points, fraction) {
  if (!points.length) return null;
  if (fraction <= 0) return points[0];
  if (fraction >= 1) return points[points.length - 1];
  const totalLen = points.reduce((acc, p, i) => {
    if (i === 0) return 0;
    const d = Math.hypot(p.lat - points[i-1].lat, p.lng - points[i-1].lng);
    return acc + d;
  }, 0);
  const target = totalLen * fraction;
  let cum = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].lat - points[i-1].lat, points[i].lng - points[i-1].lng);
    if (cum + seg >= target) {
      const t = (target - cum) / seg;
      return {
        lat: points[i-1].lat + (points[i].lat - points[i-1].lat) * t,
        lng: points[i-1].lng + (points[i].lng - points[i-1].lng) * t
      };
    }
    cum += seg;
  }
  return points[points.length - 1];
}

exports.handler = async (event) => {
  const corsResp = handleCors(event);
  if (corsResp) return corsResp;

  try {
    const { data: lines, error: linesErr } = await supabaseAdmin
      .from('bus_lines')
      .select('id, line_number, name, direction, color_hex, shape_encoded, headway_minutes')
      .not('shape_encoded', 'is', null);
    if (linesErr) throw linesErr;

    const { data: schedules, error: schedErr } = await supabaseAdmin
      .from('line_schedules')
      .select('line_id, day_type, first_departure, last_departure, headway_minutes');
    if (schedErr) throw schedErr;

    const now = new Date();
    const dayType = now.getDay() === 0 ? 'sunday' : now.getDay() === 6 ? 'saturday' : 'weekday';
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

    const vehicles = [];

    for (const line of lines) {
      const routePoints = getRoutePoints(line.shape_encoded);
      if (routePoints.length < 2) continue;

      const schedule = schedules.find(s => s.line_id === line.id && s.day_type === dayType);
      let headway = schedule?.headway_minutes ?? line.headway_minutes ?? 10;
      let firstMin = 0, lastMin = 24 * 60;
      if (schedule) {
        const [fh, fm] = schedule.first_departure.split(':').map(Number);
        const [lh, lm] = schedule.last_departure.split(':').map(Number);
        firstMin = fh * 60 + fm;
        lastMin = lh * 60 + lm;
      }

      if (minutesSinceMidnight < firstMin || minutesSinceMidnight > lastMin) continue;

      // Elapsed minutes since first departure
      let elapsed = minutesSinceMidnight - firstMin;
      if (elapsed < 0) elapsed = 0;

      // One bus per line: position cycles every headway minutes
      const cycleFraction = (elapsed % headway) / headway;
      const pos = getPointAtFraction(routePoints, cycleFraction);
      if (!pos) continue;

      vehicles.push({
        id: line.line_number,
        line_number: line.line_number,
        color: line.color_hex || '#2563EB',
        lat: pos.lat,
        lng: pos.lng,
        heading: 0,
        speed: 30,
        direction: line.direction || 'Standard',
      });
    }

    return addCorsHeaders({
      statusCode: 200,
      body: JSON.stringify(vehicles),
    }, event);
  } catch (err) {
    console.error('live-vehicles error:', err);
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    }, event);
  }
};