const { getPool } = require('./utils/db');
const { verifyAdminToken } = require('./utils/verify-auth');
const { respond, isPreflight, preflightResponse } = require('./utils/http');

// GET /.netlify/functions/weekly-trend
// Replaces: db.collectionGroup('summary').get()
// Returns one row per archived day; the frontend still buckets these into
// weeks and renders the chart exactly as before — only the data source changed.
exports.handler = async (event) => {
  if (isPreflight(event)) return preflightResponse();
  try {
    await verifyAdminToken(event);
    const pool = getPool();
    const res = await pool.query(
      `SELECT archive_date, total_deliveries, delivered
       FROM daily_summary
       ORDER BY archive_date ASC`
    );
    const rows = res.rows.map(r => ({
      date: r.archive_date.toISOString().split('T')[0],
      total: r.total_deliveries,
      delivered: r.delivered
    }));
    return respond(200, { rows });
  } catch (e) {
    return respond(e.statusCode || 500, { error: e.message || 'Server error' });
  }
};
