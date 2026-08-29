const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw Object.assign(new Error('Server misconfigured: DATABASE_URL not set'), { statusCode: 500 });
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false } // required by Supabase's pooled connection
    });
  }
  return pool;
}

module.exports = { getPool };
