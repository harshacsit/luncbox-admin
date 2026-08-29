const { getPool } = require('./utils/db');
const { verifyAdminToken } = require('./utils/verify-auth');
const { respond, isPreflight, preflightResponse } = require('./utils/http');

// GET /.netlify/functions/history?date=YYYY-MM-DD
// Replaces: db.doc('history/{date}/summary/stats').get()
//           db.collection('history/{date}/deliveries').orderBy('pickupOrder').get()
exports.handler = async (event) => {
  if (isPreflight(event)) return preflightResponse();
  try {
    await verifyAdminToken(event);

    const date = event.queryStringParameters && event.queryStringParameters.date;
    if (!date) return respond(400, { error: 'date query param is required (YYYY-MM-DD)' });

    const pool = getPool();

    const summaryRes = await pool.query(
      `SELECT total_deliveries, delivered, delayed, pending, completion_rate
       FROM daily_summary WHERE archive_date = $1`,
      [date]
    );

    const deliveriesRes = await pool.query(
      `SELECT customer_name, customer_phone, assigned_to, assigned_name, status,
              was_delayed, picked_at, "timestamp"
       FROM archived_deliveries
       WHERE archive_date = $1
       ORDER BY pickup_order ASC NULLS LAST`,
      [date]
    );

    const summary = summaryRes.rows[0]
      ? {
          totalDeliveries: summaryRes.rows[0].total_deliveries,
          delivered: summaryRes.rows[0].delivered,
          delayed: summaryRes.rows[0].delayed,
          pending: summaryRes.rows[0].pending,
          completionRate: summaryRes.rows[0].completion_rate
        }
      : null;

    const deliveries = deliveriesRes.rows.map(r => ({
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      assignedTo: r.assigned_to,
      assignedName: r.assigned_name,
      status: r.status,
      wasDelayed: r.was_delayed,
      pickedAt: r.picked_at != null ? Number(r.picked_at) : null,
      timestamp: r.timestamp != null ? Number(r.timestamp) : null
    }));

    return respond(200, { summary, deliveries });
  } catch (e) {
    return respond(e.statusCode || 500, { error: e.message || 'Server error' });
  }
};
