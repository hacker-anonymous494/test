// netlify/functions/live-vehicles.js
// Returns simulated real‑time bus positions for the map.
// Supports both encoded polylines (shape_encoded) and JSON coordinate arrays.
// No database changes needed.

'use strict';

const { supabaseAdmin } = require('./_utils/supabase');
const { addCorsHeaders, handleCors } = require('./_utils/cors');

// ─────────────────────────────────────────────────────────────────
// Helper: decode Google polyline (longitude‑first order)
// Returns array of { lat, lng } objects
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

// Helper: parse shape_encoded (supports JSON array of [lat, lng] OR encoded polyline string)
function getRoutePoints(shapeEncoded) {
  if (!shapeEncoded) return [];
  // Try to parse as JSON array (stored as '[[lat,lng],...]')
  if (typeof shapeEncoded === 'string' && shapeEncoded.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(shapeEncoded);
      if (Array.isArray(arr) && arr.length && Array.isArray(arr[0])) {
        // Convert [lat,lng] -> { lat, lng }
        return arr.map(p => ({ lat: p[0], lng: p[1] }));
      }
    } catch (e) {}
  }
  // Fallback to encoded polyline
  return decodeEncodedPolyline(shapeEncoded);
}

// Helper: get point on polyline at fraction (0..1)
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
    // 1. Fetch all active bus lines with shape data
    const { data: lines, error: linesErr } = await supabaseAdmin
      .from('bus_lines')
      .select('id, line_number, name, direction, color_hex, shape_encoded, headway_minutes')
      .not('shape_encoded', 'is', null);
    if (linesErr) throw linesErr;

    // 2. Fetch schedules for operating hours
    const { data: schedules, error: schedErr } = await supabaseAdmin
      .from('line_schedules')
      .select('line_id, day_type, first_departure, last_departure, headway_minutes');
    if (schedErr) throw schedErr;

    const now = new Date();
    const dayType = now.getDay() === 0 ? 'sunday' : now.getDay() === 6 ? 'saturday' : 'weekday';
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

    const vehicles = [];
    const maxBusesPerLine = 6; // avoid overwhelming the map

    for (const line of lines) {
      const routePoints = getRoutePoints(line.shape_encoded);
      if (routePoints.length < 2) continue;

      // Determine schedule
      const schedule = schedules.find(s => s.line_id === line.id && s.day_type === dayType);
      let headway = schedule?.headway_minutes ?? line.headway_minutes ?? 10;
      let firstMin = 0, lastMin = 24 * 60;
      if (schedule) {
        const [fh, fm] = schedule.first_departure.split(':').map(Number);
        const [lh, lm] = schedule.last_departure.split(':').map(Number);
        firstMin = fh * 60 + fm;
        lastMin = lh * 60 + lm;
      }

      // Skip if not operating
      if (minutesSinceMidnight < firstMin || minutesSinceMidnight > lastMin) continue;

      // Number of buses = (operating minutes / headway) * 0.7 (realistic density)
      const operatingMins = lastMin - firstMin;
      let busCount = Math.floor((operatingMins / headway) * 0.7);
      if (busCount < 1) busCount = 1;
      if (busCount > maxBusesPerLine) busCount = maxBusesPerLine;

      // Simulate each bus
      for (let i = 0; i < busCount; i++) {
        // Offset each bus by a fraction of headway
        const offset = (i * headway) % operatingMins;
        let elapsed = minutesSinceMidnight - firstMin;
        // Ensure positive
        if (elapsed < 0) elapsed = 0;
        let progress = (elapsed + offset) % operatingMins;
        const fraction = progress / operatingMins;
        const pos = getPointAtFraction(routePoints, fraction);
        if (!pos) continue;

        // Small random offset to avoid exact overlap
        const jitter = 0.00005;
        vehicles.push({
          id: `${line.line_number}-${i}-${Math.floor(Date.now() / 10000)}`,
          line_number: line.line_number,
          color: line.color_hex || '#2563EB',
          lat: pos.lat + (Math.random() - 0.5) * jitter,
          lng: pos.lng + (Math.random() - 0.5) * jitter,
          heading: 0,
          speed: 30 + Math.random() * 10,
          direction: line.direction || 'Standard',
        });
      }
    }

    // Optional: add a few "express" buses with different colors? Not needed.

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