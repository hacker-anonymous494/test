const { createClient } = require('@supabase/supabase-js');

// TEMPORARY hardcoded for local testing
const supabaseUrl = 'https://hsbljcqwmmbwpcvrpmuc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzYmxqY3F3bW1id3BjdnJwbXVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc5NzQ3NywiZXhwIjoyMDkyMzczNDc3fQ.nuRv3rIbKhlbCr-M5lJ-DCXCed-TGTORprseejFOdC4';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzYmxqY3F3bW1id3BjdnJwbXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTc0NzcsImV4cCI6MjA5MjM3MzQ3N30.rsDOv_vF_UNnyaHr1PNRwlam1-LnfkElPINFE38JJYM';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

module.exports = { supabaseAdmin, supabaseAnon };