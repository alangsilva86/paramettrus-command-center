import express from 'express';
import {
  buildMonthlySnapshot,
  buildPeriodSnapshot,
  compareSnapshots,
  getSnapshotCached,
  getLatestSnapshotRulesVersionId,
  listScenarioSnapshots,
  SNAPSHOT_MONEY_UNIT,
  SNAPSHOT_VERSION
} from '../services/snapshotService.js';
import { config } from '../config.js';
import { query } from '../db.js';
import { getRulesVersionById, getRulesVersionForDate } from '../services/rulesService.js';
import { refreshZohoPeriod } from '../ingest/ingestService.js';
import { startOfMonth } from '../utils/date.js';
import { countMonthsInRange, normalizeMonthRange } from '../utils/monthRef.js';
import { logError, logInfo, logWarn } from '../utils/logger.js';

const router = express.Router();

const isValidMonth = (value) => /^\d{4}-\d{2}$/.test(value);
const isSnapshotCompatible = (snapshot) =>
  snapshot &&
  snapshot.snapshot_version === SNAPSHOT_VERSION &&
  snapshot.money_unit === SNAPSHOT_MONEY_UNIT &&
  snapshot.data_coverage &&
  snapshot.kpis &&
  snapshot.kpis.premio_mtd !== undefined &&
  Array.isArray(snapshot.trend_daily);

const ensureAdminAccess = (req, res) => {
  if (!config.adminToken) return true;
  const token = req.header('x-admin-token');
  if (token !== config.adminToken) {
    logWarn('snapshot', 'Acesso negado para reprocessamento', { ip: req.ip });
    res.status(401).json({ error: 'Token expirado ou inválido.' });
    return false;
  }
  return true;
};

const resolveMonthLock = async (monthRef) => {
  const lockedByConfig = config.ingest.lockedMonths.includes(monthRef);
  const lockRow = await query('SELECT is_closed FROM month_locks WHERE month_ref = $1 LIMIT 1', [monthRef]);
  const lockedByDb = lockRow.rowCount > 0 ? Boolean(lockRow.rows[0].is_closed) : false;
  const isClosed = lockedByConfig || lockedByDb;
  return {
    isClosed,
    message: isClosed ? 'Mês fechado para alterações.' : 'Mês aberto para simulações e fechamento.'
  };
};

router.get('/month', async (req, res) => {
  const monthRef = req.query.yyyy_mm;
  const scenarioId = req.query.scenario_id || null;
  const rulesVersionId = req.query.rules_version_id || null;
  const force = req.query.force_reprocess === 'true';
  const filters = {
    vendorId: req.query.vendedor_id || null,
    ramo: req.query.ramo || null
  };
  const hasFilters = Boolean(filters.vendorId || filters.ramo);

  if (!isValidMonth(monthRef)) {
    logWarn('snapshot', 'Parametro yyyy_mm invalido', { month_ref: monthRef });
    return res.status(400).json({ error: 'yyyy_mm inválido' });
  }

  try {
    const needsAdmin = force || Boolean(rulesVersionId) || Boolean(scenarioId);
    if (needsAdmin && !ensureAdminAccess(req, res)) {
      return;
    }
    if (needsAdmin) {
      const lockStatus = await resolveMonthLock(monthRef);
      if (lockStatus.isClosed) {
        return res.status(409).json({ error: lockStatus.message });
      }
    }
    const resolvedRulesVersionId =
      !rulesVersionId && hasFilters && !scenarioId
        ? await getLatestSnapshotRulesVersionId(monthRef)
        : rulesVersionId;

    logInfo('snapshot', 'Requisicao de snapshot', {
      month_ref: monthRef,
      scenario_id: scenarioId,
      force,
      rules_version_id: resolvedRulesVersionId || 'auto',
      filters
    });
    if (!force && !hasFilters) {
      const cached = await getSnapshotCached({ monthRef, scenarioId, rulesVersionId: resolvedRulesVersionId });
      if (cached && isSnapshotCompatible(cached)) {
        logInfo('snapshot', 'Snapshot servido do cache', { month_ref: monthRef, scenario_id: scenarioId });
        return res.json(cached);
      }
    }
    const snapshot = await buildMonthlySnapshot({
      monthRef,
      scenarioId,
      force,
      rulesVersionId: resolvedRulesVersionId,
      filters,
      persist: !hasFilters
    });
    return res.json(snapshot);
  } catch (error) {
    logError('snapshot', 'Falha ao montar snapshot', {
      month_ref: monthRef,
      error: error.message
    });
    return res.status(500).json({ error: error.message });
  }
});

router.get('/period', async (req, res) => {
  const startMonth = req.query.start;
  const endMonth = req.query.end;
  const filters = {
    vendorId: req.query.vendedor_id || null,
    ramo: req.query.ramo || null
  };
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';

  if (!isValidMonth(startMonth) || !isValidMonth(endMonth)) {
    logWarn('snapshot', 'Parametros de periodo invalidos', { start_month: startMonth, end_month: endMonth });
    return res.status(400).json({ error: 'start/end inválidos (YYYY-MM)' });
  }

  try {
    if (refresh) {
      const monthsSpan = countMonthsInRange(startMonth, endMonth);
      if (monthsSpan > 12) {
        return res.status(400).json({ error: 'Período máximo para refresh é de 12 meses.' });
      }
      const normalized = normalizeMonthRange(startMonth, endMonth);
      await refreshZohoPeriod({
        startMonth: normalized.start,
        endMonth: normalized.end,
        includeInicio: true
      });
    }
    const snapshot = await buildPeriodSnapshot({
      startMonth,
      endMonth,
      filters
    });
    return res.json(snapshot);
  } catch (error) {
    logError('snapshot', 'Falha ao montar snapshot de periodo', {
      start_month: startMonth,
      end_month: endMonth,
      error: error.message,
      detail: error.detail,
      code: error.code,
      status: error.status
    });
    const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
    return res.status(status).json({
      error: error?.message || 'Falha ao montar snapshot de período.',
      detail: error?.detail || null,
      code: error?.code || null
    });
  }
});

router.get('/compare', async (req, res) => {
  const monthRef = req.query.yyyy_mm;
  const scenarioId = req.query.scenario_id;
  if (!isValidMonth(monthRef)) {
    logWarn('snapshot', 'Parametro yyyy_mm invalido', { month_ref: monthRef });
    return res.status(400).json({ error: 'yyyy_mm inválido' });
  }
  if (!scenarioId) {
    return res.status(400).json({ error: 'scenario_id obrigatório' });
  }
  try {
    const result = await compareSnapshots({ monthRef, scenarioId });
    if (!result) {
      return res.status(404).json({ error: 'Snapshots não encontrados' });
    }
    return res.json(result);
  } catch (error) {
    logError('snapshot', 'Falha ao comparar snapshots', {
      month_ref: monthRef,
      scenario_id: scenarioId,
      error: error.message
    });
    return res.status(500).json({ error: error.message });
  }
});

router.get('/scenarios', async (req, res) => {
  const monthRef = req.query.yyyy_mm;
  if (!isValidMonth(monthRef)) {
    logWarn('snapshot', 'Parametro yyyy_mm invalido', { month_ref: monthRef });
    return res.status(400).json({ error: 'yyyy_mm inválido' });
  }
  try {
    const items = await listScenarioSnapshots({ monthRef });
    return res.json({ items });
  } catch (error) {
    logError('snapshot', 'Falha ao listar cenarios', {
      month_ref: monthRef,
      error: error.message
    });
    return res.status(500).json({ error: error.message });
  }
});

router.get('/status', async (req, res) => {
  const monthRef = req.query.month_ref || req.query.month;
  if (!isValidMonth(monthRef)) {
    logWarn('snapshot', 'Parametro month_ref invalido', { month_ref: monthRef });
    return res.status(400).json({ error: 'month_ref inválido (YYYY-MM)' });
  }
  try {
    const lockedByConfig = config.ingest.lockedMonths.includes(monthRef);
    const lockRow = await query(
      'SELECT is_closed, reason, closed_at, closed_by FROM month_locks WHERE month_ref = $1 LIMIT 1',
      [monthRef]
    );
    const lockedByDb = lockRow.rowCount > 0 ? Boolean(lockRow.rows[0].is_closed) : false;
    const lockReason = lockedByConfig
      ? 'Mês bloqueado por configuração.'
      : lockRow.rowCount > 0
      ? lockRow.rows[0].reason || 'Mês bloqueado.'
      : null;

    const snapshotRow = await query(
      `SELECT created_at, rules_version_id
       FROM snapshots_month
       WHERE month_ref = $1 AND scenario_id IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [monthRef]
    );
    const lastSnapshotAt = snapshotRow.rowCount > 0 ? snapshotRow.rows[0].created_at : null;
    const rulesVersionId = snapshotRow.rowCount > 0 ? snapshotRow.rows[0].rules_version_id : null;

    const ingestion = await query(
      'SELECT status FROM ingestion_runs ORDER BY started_at DESC LIMIT 1'
    );
    const ingestionStatus = ingestion.rowCount > 0 ? ingestion.rows[0].status : 'UNKNOWN';

    let state = 'OPEN';
    if (lockedByConfig || lockedByDb) state = 'CLOSED';
    else if (ingestionStatus === 'RUNNING') state = 'PROCESSING';

    const rules =
      (rulesVersionId ? await getRulesVersionById(rulesVersionId) : null) ||
      (await getRulesVersionForDate(startOfMonth(monthRef)));

    return res.json({
      month_ref: monthRef,
      state,
      last_snapshot_at: lastSnapshotAt,
      lock_reason: lockReason,
      lock_source: lockedByConfig ? 'config' : lockedByDb ? 'db' : null,
      rules: rules
        ? {
            rules_version_id: rules.rules_version_id,
            effective_from: rules.effective_from,
            meta_global_comissao: Number(rules.meta_global_comissao),
            dias_uteis: Number(rules.dias_uteis),
            created_at: rules.created_at || null,
            created_by: rules.created_by || null,
            audit_note: rules.audit_note || null
          }
        : null
    });
  } catch (error) {
    logError('snapshot', 'Falha ao consultar status do mês', {
      month_ref: monthRef,
      error: error.message
    });
    return res.status(500).json({ error: 'Falha ao consultar status do mês.' });
  }
});

export default router;
