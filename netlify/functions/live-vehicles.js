// netlify/functions/live-vehicles.js
// Returns simulated real‑time bus positions for the map.
// Uses existing bus_lines, line_schedules, and bus_line_stops.
// No database changes needed.

'use strict';

const { supabaseAdmin } = require('./_utils/supabase');
const { addCorsHeaders, handleCors } = require('./_utils/cors');

// Helper: decode polyline (same as in frontend)
function decodePolyline(encoded) {
  if (!encoded) return [];
  let index = 0, lat = 0, lng = 0;
  const points = [];
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return points;
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
    // 1. Fetch all active bus lines with their shape and schedules
    const { data: lines, error: linesErr } = await supabaseAdmin
      .from('bus_lines')
      .select('id, line_number, name, direction, color_hex, shape_encoded, headway_minutes')
      .not('shape_encoded', 'is', null);
    if (linesErr) throw linesErr;

    // 2. Fetch schedules to know operating hours
    const { data: schedules, error: schedErr } = await supabaseAdmin
      .from('line_schedules')
      .select('line_id, day_type, first_departure, last_departure, headway_minutes');
    if (schedErr) throw schedErr;

    const now = new Date();
    const dayType = now.getDay() === 0 ? 'sunday' : now.getDay() === 6 ? 'saturday' : 'weekday';
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

    const vehicles = [];

    for (const line of lines) {
      // Determine current headway from schedule or fallback
      const schedule = schedules.find(s => s.line_id === line.id && s.day_type === dayType);
      let headway = schedule?.headway_minutes ?? line.headway_minutes ?? 10;
      let firstMin = 0, lastMin = 24*60;
      if (schedule) {
        const [fh, fm] = schedule.first_departure.split(':').map(Number);
        const [lh, lm] = schedule.last_departure.split(':').map(Number);
        firstMin = fh * 60 + fm;
        lastMin = lh * 60 + lm;
      }

      // Skip if not operating
      if (minutesSinceMidnight < firstMin || minutesSinceMidnight > lastMin) continue;

      // Simulate number of buses on this line: (operating minutes / headway) * 0.7 (some slack)
      const operatingMins = lastMin - firstMin;
      let busCount = Math.floor(operatingMins / headway) * 0.7;
      if (busCount < 1) busCount = 1;

      // For each virtual bus, compute its position along the line based on time
      const polyPoints = decodePolyline(line.shape_encoded);
      if (polyPoints.length < 2) continue;

      for (let i = 0; i < busCount; i++) {
        // Cycle offset: each bus runs at a different phase
        const offset = (i * headway) % operatingMins;
        const elapsed = minutesSinceMidnight - firstMin;
        let progress = (elapsed + offset) % operatingMins;
        const fraction = progress / operatingMins;
        const pos = getPointAtFraction(polyPoints, fraction);
        if (!pos) continue;

        // Determine direction (from line name or direction field)
        const direction = line.direction || (line.line_number.includes('a') ? 'drejt Allias' : 'drejt Selitë');

        vehicles.push({
          id: `${line.line_number}-${i}-${now.getTime()}`,
          line_number: line.line_number,
          color: line.color_hex || '#2563EB',
          lat: pos.lat,
          lng: pos.lng,
          heading: 0, // could be computed from next point, but optional
          speed: 25,  // km/h, approximate
          direction,
        });
      }
    }

    // Add some random variation to make it look lively
    vehicles.forEach(v => {
      v.lat += (Math.random() - 0.5) * 0.0005;
      v.lng += (Math.random() - 0.5) * 0.0005;
    });

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