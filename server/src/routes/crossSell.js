import express from 'express';
import { getCrossSellSummary } from '../services/crossSellService.js';
import { logError, logInfo } from '../utils/logger.js';

const router = express.Router();

router.get('/auto-sem-vida', async (_req, res) => {
  try {
    logInfo('cross', 'Requisicao auto-sem-vida recebida');
    const summary = await getCrossSellSummary();
    logInfo('cross', 'Requisicao atendida', { auto_sem_vida: summary.autoSemVidaCount });
    res.json(summary);
  } catch (error) {
    logError('cross', 'Falha ao montar cross-sell', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
