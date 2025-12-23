import express from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { createRulesVersion } from '../services/rulesService.js';
import { runIngestion } from '../ingest/ingestService.js';
import { probeZohoReport } from '../ingest/zohoClient.js';
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

const isValidMonth = (value) => /^\d{4}-\d{2}$/.test(value);

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

router.get('/rules_versions', requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  try {
    logInfo('admin', 'Listando rules versions', { limit });
    const result = await query(
      `SELECT rules_version_id,
              effective_from,
              effective_to,
              meta_global_comissao,
              dias_uteis,
              product_weights,
              bonus_events,
              penalties,
              created_by,
              created_at,
              audit_note
       FROM rules_versions
       ORDER BY effective_from DESC, created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ items: result.rows });
  } catch (error) {
    logError('admin', 'Falha ao listar rules versions', { error: error.message });
    res.status(500).json({ error: error.message });
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

router.post('/snapshots/purge', requireAdmin, async (req, res) => {
  const monthRef = req.body?.month_ref;
  const scenarioId = Object.prototype.hasOwnProperty.call(req.body || {}, 'scenario_id')
    ? req.body.scenario_id
    : undefined;
  if (!monthRef || !isValidMonth(monthRef)) {
    return res.status(400).json({ error: 'month_ref inválido (YYYY-MM)' });
  }
  try {
    const conditions = ['month_ref = $1'];
    const params = [monthRef];
    if (scenarioId !== undefined) {
      params.push(scenarioId || null);
      conditions.push(`scenario_id IS NOT DISTINCT FROM $${params.length}`);
    }
    const result = await query(
      `DELETE FROM snapshots_month WHERE ${conditions.join(' AND ')}`,
      params
    );
    logInfo('admin', 'Snapshots purge executado', {
      month_ref: monthRef,
      scenario_id: scenarioId ?? 'all',
      deleted: result.rowCount
    });
    return res.json({ deleted: result.rowCount });
  } catch (error) {
    logError('admin', 'Falha ao remover snapshots', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

router.get('/zoho/health', requireAdmin, async (_req, res) => {
  try {
    logInfo('admin', 'Probe Zoho health solicitado');
    const probe = await probeZohoReport();
    res.json({ status: 'ok', ...probe });
  } catch (error) {
    logError('admin', 'Falha no probe Zoho health', { error: error.message });
    res.status(502).json({
      status: 'error',
      error: error.message,
      code: error.code || null
    });
  }
});

export default router;
