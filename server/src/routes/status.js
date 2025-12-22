import express from 'express';
import { query } from '../db.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const latest = await query(
      'SELECT status, finished_at FROM ingestion_runs ORDER BY started_at DESC LIMIT 1'
    );
    if (latest.rowCount === 0) {
      return res.json({ status: 'UNKNOWN', last_ingestion_at: null, stale_data: false });
    }
    const status = latest.rows[0].status;
    return res.json({
      status,
      last_ingestion_at: latest.rows[0].finished_at,
      stale_data: status === 'STALE_DATA'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
