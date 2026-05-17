const allowedOrigins = ['http://localhost:8888'];

const headers = (origin) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
});

exports.handleCors = (event, callback) => {
  if (event.httpMethod === 'OPTIONS') {
    const origin = event.headers.origin || '';
    return callback(null, {
      statusCode: 204,
      headers: headers(origin),
      body: '',
    });
  }
  return null;
};

exports.addCorsHeaders = (response, event) => {
  const origin = event?.headers?.origin || '';
  return { ...response, headers: { ...response.headers, ...headers(origin) } };
};