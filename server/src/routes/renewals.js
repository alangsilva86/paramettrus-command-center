import express from 'express';
import { listRenewals } from '../services/renewalService.js';
import { logError, logInfo } from '../utils/logger.js';

const router = express.Router();

router.get('/list', async (req, res) => {
  const windowDays = Number(req.query.window || 15);
  try {
    logInfo('renewal', 'Requisicao lista renovacoes', { window_days: windowDays });
    const list = await listRenewals({ windowDays });
    logInfo('renewal', 'Lista renovacoes pronta', { items: list.length });
    res.json({ window_days: windowDays, items: list });
  } catch (error) {
    logError('renewal', 'Falha ao listar renovacoes', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
