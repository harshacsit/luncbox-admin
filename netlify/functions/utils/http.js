const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function respond(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj)
  };
}

function isPreflight(event) {
  return event.httpMethod === 'OPTIONS';
}

function preflightResponse() {
  return { statusCode: 204, headers: CORS_HEADERS, body: '' };
}

module.exports = { CORS_HEADERS, respond, isPreflight, preflightResponse };
