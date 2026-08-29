const admin = require('firebase-admin');

let initialized = false;

function initAdmin() {
  if (initialized) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw Object.assign(new Error('Server misconfigured: FIREBASE_SERVICE_ACCOUNT_JSON not set'), { statusCode: 500 });
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  initialized = true;
}

// Verifies the Firebase ID token sent as "Authorization: Bearer <token>".
// Any signed-in Firebase Auth user passes this check — same trust level as
// the current Firestore rules (request.auth != null), so behavior matches
// what the dashboard already assumes about who can read history/analytics.
async function verifyAdminToken(event) {
  initAdmin();
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing or malformed Authorization header'), { statusCode: 401 });
  }
  const idToken = authHeader.slice('Bearer '.length);
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    throw Object.assign(new Error('Invalid or expired token'), { statusCode: 401 });
  }
}

module.exports = { verifyAdminToken };
