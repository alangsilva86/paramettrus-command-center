import express from 'express';
import { listRenewals } from '../services/renewalService.js';
import { logError, logInfo } from '../utils/logger.js';

const router = express.Router();

router.get('/list', async (req, res) => {
  const windowDays = Number(req.query.window || 15);
  const vendorId = req.query.vendedor_id || null;
  const ramo = req.query.ramo || null;
  const referenceDate = req.query.reference_date || req.query.reference;
  try {
    logInfo('renewal', 'Requisicao lista renovacoes', {
      window_days: windowDays,
      vendor_id: vendorId,
      ramo,
      reference_date: referenceDate
    });
    const list = await listRenewals({ windowDays, vendorId, ramo, referenceDate });
    logInfo('renewal', 'Lista renovacoes pronta', { items: list.length });
    res.json({ window_days: windowDays, items: list });
  } catch (error) {
    logError('renewal', 'Falha ao listar renovacoes', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
