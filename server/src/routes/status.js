import express from 'express';
import { query } from '../db.js';
import { logError, logInfo } from '../utils/logger.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    logInfo('server', 'Consulta de status solicitada');
    const latest = await query(
      'SELECT status, finished_at FROM ingestion_runs ORDER BY started_at DESC LIMIT 1'
    );
    if (latest.rowCount === 0) {
      return res.json({ status: 'UNKNOWN', last_ingestion_at: null, stale_data: false });
    }
    const status = latest.rows[0].status;
    logInfo('server', 'Status enviado', { status });
    return res.json({
      status,
      last_ingestion_at: latest.rows[0].finished_at,
      stale_data: status === 'STALE_DATA'
    });
  } catch (error) {
    logError('server', 'Falha ao consultar status', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

export default router;
