const { Client } = require('pg');
const { respond, isPreflight, preflightResponse } = require('./utils/http');

exports.handler = async (event) => {
  if (isPreflight(event)) return preflightResponse();

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const backfillSecret = process.env.BACKFILL_SECRET;

  let authorized = false;

  // 1. Check if the request carries the correct BACKFILL_SECRET in Bearer auth
  if (backfillSecret && authHeader === `Bearer ${backfillSecret}`) {
    authorized = true;
  }

  // 2. If not authorized by the secret key, try verifying the Firebase Admin token
  if (!authorized) {
    const { verifyAdminToken } = require('./utils/verify-auth');
    try {
      await verifyAdminToken(event);
      authorized = true;
    } catch (authErr) {
      return respond(401, { error: 'Unauthorized: Invalid token or secret' });
    }
  }

  const dateParam = event.queryStringParameters?.date;
  if (!dateParam) {
    return respond(400, { error: 'Missing ?date=YYYY-MM-DD' });
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL, // Supabase Transaction Pooler, port 6543
  });

  try {
    await client.connect();

    // ── DEBUG — remove after fixing ──
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
    console.log("SA JSON present:", !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    console.log("SA present:", !!process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("Selected SA length:", raw?.length);
    console.log("Selected SA first 50 chars:", raw?.substring(0, 50));
    console.log("Selected SA last 20 chars:", raw ? raw.substring(raw.length - 20) : undefined);
    try {
      const parsed = JSON.parse(raw);
      console.log("Parsed OK, project_id:", parsed.project_id);
      console.log("Has private_key:", !!parsed.private_key);
      console.log("private_key starts:", parsed.private_key?.substring(0, 30));
    } catch (parseErr) {
      console.log("JSON.parse FAILED:", parseErr.message);
    }
    // ── END DEBUG ──

    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT)),
      });
    }
    const db = admin.firestore();

    const snap = await db.collection('history').doc(dateParam).collection('deliveries').get();

    let inserted = 0;
    for (const doc of snap.docs) {
      const d = doc.data();
      await client.query(
        `INSERT INTO archived_deliveries
         (id, archive_date, customer_id, customer_name, customer_phone, box_id,
          pickup_location, delivery_address, assigned_to, assigned_name, agent_phone,
          status, was_delayed, pickup_order, item_count, notes, delivery_date,
          picked_at, timestamp, archived_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (id) DO NOTHING`,
        [
          doc.id,                     // id
          dateParam,                  // archive_date
          d.customerId || null,
          d.customerName || null,
          d.customerPhone || null,
          d.boxId || null,
          d.pickupLocation || null,
          d.deliveryAddress || null,
          d.assignedTo || null,
          d.assignedName || null,
          d.agentPhone || null,
          d.status || null,
          d.wasDelayed || false,
          d.pickupOrder || null,
          d.itemCount || null,
          d.notes || null,
          d.deliveryDate || dateParam,  // delivery_date (fallback to folder date if missing)
          d.pickedAt || null,
          d.timestamp || null,
          d.archivedAt || null
        ]
      );
      inserted++;
    }

    await client.end();
    return respond(200, { date: dateParam, processed: inserted });

  } catch (err) {
    await client.end().catch(() => {});
    return respond(500, { error: err.message });
  }
};