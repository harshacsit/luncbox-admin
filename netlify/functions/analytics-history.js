const { getPool } = require('./utils/db');
const { verifyAdminToken } = require('./utils/verify-auth');
const { respond, isPreflight, preflightResponse } = require('./utils/http');

// GET /.netlify/functions/analytics-history?scope=all
// GET /.netlify/functions/analytics-history?scope=month&month=YYYY-MM
//
// Replaces: db.collectionGroup('deliveries').get() + the client-side
// per-customer / per-agent aggregation loop in analytics.js. The same
// counts (total, delivered, noboxAgent, delayedFlag, endedDelayed for
// customers; total, delivered, delayedEnded, delayedFlag, noBoxAgent for
// agents) are now computed in SQL instead of by looping every archived
// delivery in the browser.
exports.handler = async (event) => {
  if (isPreflight(event)) return preflightResponse();
  try {
    await verifyAdminToken(event);

    const scope = (event.queryStringParameters && event.queryStringParameters.scope) || 'all';
    const month = event.queryStringParameters && event.queryStringParameters.month; // YYYY-MM
    const isMonth = scope === 'month' && !!month;

    const pool = getPool();

    const custConditions = ['customer_id IS NOT NULL'];
    const custParams = [];
    if (isMonth) {
      custParams.push(month);
      custConditions.push(`to_char(archive_date, 'YYYY-MM') = $${custParams.length}`);
    }
    const custWhere = 'WHERE ' + custConditions.join(' AND ');

    const custRes = await pool.query(
      `SELECT customer_id,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('Delivered','Picked'))::int AS delivered,
              COUNT(*) FILTER (WHERE status = 'NoBox')::int AS nobox_agent,
              COUNT(*) FILTER (WHERE was_delayed = true)::int AS delayed_flag,
              COUNT(*) FILTER (WHERE status = 'Delayed')::int AS ended_delayed
       FROM archived_deliveries
       ${custWhere}
       GROUP BY customer_id`,
      custParams
    );

    const agentConditions = ['assigned_to IS NOT NULL'];
    const agentParams = [];
    if (isMonth) {
      agentParams.push(month);
      agentConditions.push(`to_char(archive_date, 'YYYY-MM') = $${agentParams.length}`);
    }
    const agentWhere = 'WHERE ' + agentConditions.join(' AND ');

    const agentRes = await pool.query(
      `SELECT assigned_to,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('Delivered','Picked'))::int AS delivered,
              COUNT(*) FILTER (WHERE status = 'Delayed')::int AS delayed_ended,
              COUNT(*) FILTER (WHERE was_delayed = true)::int AS delayed_flag,
              COUNT(*) FILTER (WHERE status = 'NoBox')::int AS no_box_agent
       FROM archived_deliveries
       ${agentWhere}
       GROUP BY assigned_to`,
      agentParams
    );

    const customers = custRes.rows.map(r => ({
      customerId: r.customer_id,
      total: r.total,
      delivered: r.delivered,
      noboxAgent: r.nobox_agent,
      delayedFlag: r.delayed_flag,
      endedDelayed: r.ended_delayed
    }));

    const agentsOut = agentRes.rows.map(r => ({
      agentId: r.assigned_to,
      total: r.total,
      delivered: r.delivered,
      delayedEnded: r.delayed_ended,
      delayedFlag: r.delayed_flag,
      noBoxAgent: r.no_box_agent
    }));

    return respond(200, { customers, agents: agentsOut });
  } catch (e) {
    return respond(e.statusCode || 500, { error: e.message || 'Server error' });
  }
};
