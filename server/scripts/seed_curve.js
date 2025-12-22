import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const curveId = process.env.DEFAULT_CURVE_ID || 'curve_default';
const daysInMonth = 31;

const run = async () => {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT 1 FROM month_curve WHERE curve_id = $1 LIMIT 1',
      [curveId]
    );
    if (existing.rowCount > 0) {
      console.log('Curve already exists, skipping.');
      return;
    }
    const inserts = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const cumShare = Number((day / daysInMonth).toFixed(4));
      inserts.push({ day, cumShare });
    }
    for (const row of inserts) {
      await client.query(
        'INSERT INTO month_curve (curve_id, day, cum_share) VALUES ($1, $2, $3)',
        [curveId, row.day, row.cumShare]
      );
    }
    console.log('Default curve seeded.');
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
