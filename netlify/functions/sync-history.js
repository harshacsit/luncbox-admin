const { getPool } = require('./utils/db');
const { verifyAdminToken } = require('./utils/verify-auth');
const { respond, isPreflight, preflightResponse } = require('./utils/http');

// POST /.netlify/functions/sync-history
// Body: { date: "YYYY-MM-DD", summary: {...}, deliveries: [{...}, ...] }
//
// Called once per day by triggerReset() in history.js, BEFORE the Firestore
// `deliveries` collection is cleared. If this call fails, the reset is
// aborted and nothing is deleted — the admin can just retry.
exports.handler = async (event) => {
  if (isPreflight(event)) return preflightResponse();
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  try {
    await verifyAdminToken(event);

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return respond(400, { error: 'Invalid JSON body' });
    }

    const { date, summary, deliveries } = payload;
    if (!date || !Array.isArray(deliveries)) {
      return respond(400, { error: 'date (string) and deliveries (array) are required' });
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (summary) {
        await client.query(
          `INSERT INTO daily_summary
             (archive_date, total_deliveries, delivered, delayed, pending, completion_rate, archived_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (archive_date) DO UPDATE SET
             total_deliveries = EXCLUDED.total_deliveries,
             delivered        = EXCLUDED.delivered,
             delayed          = EXCLUDED.delayed,
             pending          = EXCLUDED.pending,
             completion_rate  = EXCLUDED.completion_rate,
             archived_at      = EXCLUDED.archived_at`,
          [
            date,
            summary.totalDeliveries || 0,
            summary.delivered || 0,
            summary.delayed || 0,
            summary.pending || 0,
            summary.completionRate || 0,
            summary.archivedAt || Date.now()
          ]
        );
      }

      // Re-syncing the same date is safe: clear that date's rows first, then
      // insert fresh. Avoids partial-batch duplicate rows on retry.
      await client.query(`DELETE FROM archived_deliveries WHERE archive_date = $1`, [date]);

      for (const d of deliveries) {
        await client.query(
          `INSERT INTO archived_deliveries
             (id, archive_date, customer_id, customer_name, customer_phone, box_id,
              pickup_location, delivery_address, assigned_to, assigned_name, agent_phone,
              status, was_delayed, pickup_order, item_count, notes, delivery_date,
              picked_at, "timestamp", archived_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           ON CONFLICT (id) DO UPDATE SET
             archive_date = EXCLUDED.archive_date,
             status       = EXCLUDED.status,
             was_delayed  = EXCLUDED.was_delayed`,
          [
            d.id, date, d.customerId || null, d.customerName || null, d.customerPhone || null,
            d.boxId || null, d.pickupLocation || null, d.deliveryAddress || null,
            d.assignedTo || null, d.assignedName || null, d.agentPhone || null,
            d.status || null, !!d.wasDelayed, d.pickupOrder || null, d.itemCount || null,
            d.notes || null, d.deliveryDate || null, d.pickedAt || null, d.timestamp || null,
            d.archivedAt || Date.now()
          ]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return respond(200, { ok: true, synced: deliveries.length });
  } catch (e) {
    return respond(e.statusCode || 500, { error: e.message || 'Server error' });
  }
};
