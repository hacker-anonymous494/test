// netlify/functions/_utils/security.js
const crypto = require('crypto');
const { supabaseAdmin } = require('./supabase');

// Simple in‑memory rate limiter (for demo; for production use Redis or Upstash)
const rateLimitStore = new Map();

function rateLimit(identifier, maxRequests = 30, windowMs = 60 * 1000) {
  const now = Date.now();
  const record = rateLimitStore.get(identifier) || { count: 0, resetTime: now + windowMs };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }
  record.count++;
  rateLimitStore.set(identifier, record);
  return record.count <= maxRequests;
}

async function logSecurityEvent(eventType, data, ip, userId = null, sessionId = null) {
  try {
    await supabaseAdmin.from('security_events').insert({
      event_type: eventType,
      data: data || {},
      ip_address: ip,
      user_id: userId,
      session_id: sessionId,
    });
  } catch (err) {
    console.error('Failed to log security event:', err);
  }
}

function getClientIp(event) {
  const xForwardedFor = event.headers['x-forwarded-for'];
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  return event.headers['client-ip'] || event.requestContext?.http?.sourceIp || '0.0.0.0';
}

module.exports = { rateLimit, logSecurityEvent, getClientIp };