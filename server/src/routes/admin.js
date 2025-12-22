import express from 'express';
import { config } from '../config.js';
import { createRulesVersion } from '../services/rulesService.js';
import { runIngestion } from '../ingest/ingestService.js';
import { logError, logInfo, logWarn } from '../utils/logger.js';

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (!config.adminToken) return next();
  const token = req.header('x-admin-token');
  if (token !== config.adminToken) {
    logWarn('admin', 'Acesso negado no admin', { ip: req.ip });
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
};

router.post('/rules_versions', requireAdmin, async (req, res) => {
  try {
    logInfo('admin', 'Criacao de rules version solicitada', { actor: req.header('x-user-id') || 'system' });
    const requiredFields = ['effective_from', 'meta_global_comissao', 'dias_uteis', 'product_weights', 'bonus_events'];
    const missing = requiredFields.filter((field) => req.body?.[field] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Campos obrigatórios: ${missing.join(', ')}` });
    }
    const rulesVersionId = await createRulesVersion({
      payload: req.body,
      actor: req.header('x-user-id') || 'system',
      force: Boolean(req.body?.force)
    });
    res.json({ rules_version_id: rulesVersionId, status: 'CREATED' });
  } catch (error) {
    logError('admin', 'Falha ao criar rules version', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

router.post('/ingest', requireAdmin, async (req, res) => {
  try {
    logInfo('admin', 'Ingestao manual solicitada', { actor: req.header('x-user-id') || 'system' });
    const result = await runIngestion();
    res.json({ status: result.status, run_id: result.runId });
  } catch (error) {
    logError('admin', 'Falha na ingestao manual', { error: error.message });
    res.status(502).json({ status: 'STALE_DATA', error: error.message });
  }
});

export default router;
