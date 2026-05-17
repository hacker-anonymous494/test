const { supabaseAdmin } = require('./_utils/supabase');
const { handleCors, addCorsHeaders } = require('./_utils/cors');
const cookie = require('cookie');

exports.handler = async (event, context) => {
  const corsResponse = handleCors(event, (err, res) => res);
  if (corsResponse) return corsResponse;

  const path = event.path.replace('/.netlify/functions/auth', '').replace(/^\//, '');
  const method = event.httpMethod;

  // Helper: set access token cookie
  const setAccessTokenCookie = (token, maxAge = 60 * 60 * 24 * 7) => {
    return cookie.serialize('sb_access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge
    });
  };

  const clearAccessTokenCookie = () => {
    return cookie.serialize('sb_access_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0
    });
  };

  // REGISTER
  if (path === 'register' && method === 'POST') {
    try {
      const { email, password, firstName, lastName, phone, userType } = JSON.parse(event.body);
      // Create user using admin API (bypasses email confirmation)
      const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName, phone, user_type: userType }
      });
      if (adminError) throw adminError;

      // Insert into public.users
      await supabaseAdmin.from('users').insert({
        id: adminData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
        user_type: userType
      });

      // Sign in to get session tokens
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const cookieHeader = setAccessTokenCookie(signInData.session.access_token);

      return addCorsHeaders({
        statusCode: 200,
        headers: { 'Set-Cookie': cookieHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          user: {
            id: signInData.user.id,
            email: signInData.user.email,
            firstName,
            lastName,
            userType
          }
        })
      }, event);
    } catch (err) {
      console.error('Registration error:', err);
      return addCorsHeaders({
        statusCode: 400,
        body: JSON.stringify({ success: false, error: err.message })
      }, event);
    }
  }

  // LOGIN
  if (path === 'login' && method === 'POST') {
    try {
      const { email, password, rememberMe } = JSON.parse(event.body);
      const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const maxAge = rememberMe ? 60 * 60 * 24 * 30 : null;
      const cookieHeader = setAccessTokenCookie(data.session.access_token, maxAge);

      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('first_name, last_name, user_type, preferences')
        .eq('id', data.user.id)
        .single();

      return addCorsHeaders({
        statusCode: 200,
        headers: { 'Set-Cookie': cookieHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          user: {
            id: data.user.id,
            email: data.user.email,
            firstName: userData?.first_name,
            lastName: userData?.last_name,
            userType: userData?.user_type || 'passenger',
            preferences: userData?.preferences || {}
          }
        })
      }, event);
    } catch (err) {
      return addCorsHeaders({
        statusCode: 401,
        body: JSON.stringify({ success: false, error: err.message })
      }, event);
    }
  }

  // VALIDATE SESSION (reads cookie)
  if (path === 'validate-session' && method === 'GET') {
    try {
      const cookies = cookie.parse(event.headers.cookie || '');
      const accessToken = cookies.sb_access_token;
      if (!accessToken) throw new Error('No token in cookie');

      const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
      if (error || !user) throw new Error('Invalid token');

      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('first_name, last_name, user_type, preferences')
        .eq('id', user.id)
        .single();

      return addCorsHeaders({
        statusCode: 200,
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: userData?.first_name,
            lastName: userData?.last_name,
            userType: userData?.user_type,
            preferences: userData?.preferences
          }
        })
      }, event);
    } catch (err) {
      return addCorsHeaders({
        statusCode: 401,
        body: JSON.stringify({ authenticated: false })
      }, event);
    }
  }

  // LOGOUT
  if (path === 'logout' && method === 'POST') {
    const cookieHeader = clearAccessTokenCookie();
    return addCorsHeaders({
      statusCode: 200,
      headers: { 'Set-Cookie': cookieHeader },
      body: JSON.stringify({ success: true })
    }, event);
  }

  return addCorsHeaders({ statusCode: 404, body: JSON.stringify({ error: 'Not found' }) }, event);
};