// netlify/functions/send-contact.js
const { addCorsHeaders, handleCors } = require('./_utils/cors');
const { supabaseAdmin } = require('./_utils/supabase');
const { rateLimit, logSecurityEvent, getClientIp } = require('./_utils/security');

// Set RESEND_API_KEY in Netlify environment variables
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'support@sherbimijone.com';
const FROM_EMAIL = 'onboarding@resend.dev'; // or your verified domain

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, email not sent');
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: subject,
      html: html,
    }),
  });
  return res.ok;
}

exports.handler = async (event) => {
  const corsResp = handleCors(event);
  if (corsResp) return corsResp;

  if (event.httpMethod !== 'POST') {
    return addCorsHeaders({ statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) });
  }

  const clientIp = getClientIp(event);
  // Rate limit: max 5 submissions per hour per IP
  if (!rateLimit(`contact:${clientIp}`, 5, 60 * 60 * 1000)) {
    await logSecurityEvent('rate_limit_exceeded', { endpoint: 'send-contact' }, clientIp);
    return addCorsHeaders({ statusCode: 429, body: JSON.stringify({ error: 'Too many requests. Please try again later.' }) });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return addCorsHeaders({ statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) });
  }

  // Honeypot check – field should be empty
  if (body.website && body.website !== '') {
    // Bot detected – silently ignore
    await logSecurityEvent('honeypot_triggered', { honeypot: body.website }, clientIp);
    return addCorsHeaders({ statusCode: 200, body: JSON.stringify({ success: true, message: 'Message received' }) });
  }

  const { name, email, message, _csrf } = body;
  if (!name || !email || !message) {
    return addCorsHeaders({ statusCode: 400, body: JSON.stringify({ error: 'All fields are required' }) });
  }

  // Basic validation
  if (name.length < 2 || name.length > 100) {
    return addCorsHeaders({ statusCode: 400, body: JSON.stringify({ error: 'Name must be between 2 and 100 characters' }) });
  }
  const emailRegex = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;
  if (!emailRegex.test(email)) {
    return addCorsHeaders({ statusCode: 400, body: JSON.stringify({ error: 'Invalid email address' }) });
  }
  if (message.length < 10 || message.length > 5000) {
    return addCorsHeaders({ statusCode: 400, body: JSON.stringify({ error: 'Message must be between 10 and 5000 characters' }) });
  }

  // CSRF token check (optional but good)
  // In frontend we will generate a token stored in localStorage – compare here
  // For simplicity, we skip CSRF for now but can add later.

  try {
    // Store in Supabase
    const { error: insertError } = await supabaseAdmin
      .from('contact_messages')
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        message: message.trim(),
        ip_address: clientIp,
        user_agent: event.headers['user-agent'],
      });
    if (insertError) throw insertError;

    // Send email notification
    const emailHtml = `
      <h2>New Contact Message</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      <hr>
      <p><small>IP: ${clientIp}</small></p>
    `;
    await sendEmail(CONTACT_TO_EMAIL, `New contact from ${name}`, emailHtml);

    await logSecurityEvent('contact_submitted', { email }, clientIp);
    return addCorsHeaders({ statusCode: 200, body: JSON.stringify({ success: true, message: 'Your message has been sent. We will respond shortly.' }) });
  } catch (err) {
    console.error('Contact error:', err);
    await logSecurityEvent('contact_error', { error: err.message }, clientIp);
    return addCorsHeaders({ statusCode: 500, body: JSON.stringify({ error: 'Internal server error. Please try again later.' }) });
  }
};

function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}   