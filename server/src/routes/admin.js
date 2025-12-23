import express from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { buildMonthlySnapshot } from '../services/snapshotService.js';
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
    return res.status(401).json({ error: 'Token expirado ou inválido.' });
  }
  return next();
};

const isValidMonth = (value) => /^\d{4}-\d{2}$/.test(value);
const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const getLatestIngestionStatus = async () => {
  const result = await query(
    'SELECT status, finished_at FROM ingestion_runs ORDER BY started_at DESC LIMIT 1'
  );
  if (result.rowCount === 0) return { status: 'UNKNOWN', finishedAt: null };
  return {
    status: result.rows[0].status,
    finishedAt: result.rows[0].finished_at
  };
};

const resolveMonthLock = async (monthRef) => {
  const lockedByConfig = config.ingest.lockedMonths.includes(monthRef);
  const result = await query('SELECT is_closed FROM month_locks WHERE month_ref = $1 LIMIT 1', [monthRef]);
  const lockedByDb = result.rowCount > 0 ? Boolean(result.rows[0].is_closed) : false;
  const isClosed = lockedByConfig || lockedByDb;
  const source = lockedByConfig ? 'config' : lockedByDb ? 'db' : null;
  return {
    isClosed,
    source,
    message: isClosed ? 'Mês fechado para alterações.' : 'Mês aberto para simulações e fechamento.'
  };
};

const buildDraftRules = ({ payload, scenarioId }) => ({
  rules_version_id: `draft_${scenarioId}`,
  effective_from: isValidDate(payload?.effective_from)
    ? payload.effective_from
    : new Date().toISOString().slice(0, 10),
  effective_to: payload?.effective_to || null,
  meta_global_comissao: Number(payload?.meta_global_comissao || 0),
  dias_uteis: Number(payload?.dias_uteis || 0),
  product_weights: Object.fromEntries(
    Object.entries(payload?.product_weights || {}).map(([key, value]) => [key, Number(value || 0)])
  ),
  bonus_events: Object.fromEntries(
    Object.entries(payload?.bonus_events || {}).map(([key, value]) => [key, Number(value || 0)])
  ),
  penalties: payload?.penalties || { churn_lock_xp: true },
  audit_note: payload?.audit_note || 'Simulação em rascunho'
});

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

router.get('/month-status', requireAdmin, async (req, res) => {
  const monthRef = req.query.month_ref;
  if (!monthRef || !isValidMonth(monthRef)) {
    return res.status(400).json({ error: 'month_ref inválido (YYYY-MM)' });
  }
  try {
    const { isClosed, source, message } = await resolveMonthLock(monthRef);
    return res.json({
      month_ref: monthRef,
      is_closed: isClosed,
      source,
      message
    });
  } catch (error) {
    logError('admin', 'Falha ao consultar month lock', { error: error.message });
    return res.status(500).json({ error: 'Falha ao consultar bloqueio do mês.' });
  }
});

router.post('/scenarios', requireAdmin, async (req, res) => {
  const monthRef = req.body?.month_ref;
  if (!monthRef || !isValidMonth(monthRef)) {
    return res.status(400).json({ error: 'month_ref inválido (YYYY-MM)' });
  }
  if (!req.body?.rules_payload) {
    return res.status(400).json({ error: 'rules_payload obrigatório' });
  }
  try {
    const lockStatus = await resolveMonthLock(monthRef);
    if (lockStatus.isClosed) {
      return res.status(409).json({ error: lockStatus.message });
    }
    const scenarioId = req.body?.scenario_id || `draft_${Date.now()}`;
    const draftRules = buildDraftRules({ payload: req.body.rules_payload, scenarioId });
    const snapshot = await buildMonthlySnapshot({
      monthRef,
      scenarioId,
      force: false,
      rulesOverride: draftRules
    });
    return res.json(snapshot);
  } catch (error) {
    logError('admin', 'Falha ao simular cenário', { error: error.message });
    return res.status(400).json({ error: error.message });
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
    const [probe, ingestion] = await Promise.all([probeZohoReport(), getLatestIngestionStatus()]);
    await query('SELECT 1');
    res.json({
      status: 'ok',
      zoho: { status: 'ok', ...probe },
      db: { status: 'ok' },
      last_ingestion_at: ingestion.finishedAt,
      ingestion_status: ingestion.status
    });
  } catch (error) {
    logError('admin', 'Falha no probe Zoho health', { error: error.message });
    const isAuthError = error?.code === 'ZOHO_AUTH_401' || error?.status === 401;
    res.status(502).json({
      status: 'error',
      error: isAuthError ? 'Token Zoho expirado ou inválido.' : 'Falha ao validar conexões.',
      code: error.code || null
    });
  }
});

export default router;
