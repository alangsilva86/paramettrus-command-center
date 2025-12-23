import express from 'express';
import {
  buildMonthlySnapshot,
  compareSnapshots,
  getSnapshotCached,
  listScenarioSnapshots
} from '../services/snapshotService.js';
import { logError, logInfo, logWarn } from '../utils/logger.js';

const router = express.Router();

const isValidMonth = (value) => /^\d{4}-\d{2}$/.test(value);
const isSnapshotCompatible = (snapshot) =>
  snapshot &&
  snapshot.data_coverage &&
  snapshot.kpis &&
  snapshot.kpis.premio_mtd !== undefined &&
  Array.isArray(snapshot.trend_daily);

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

  logInfo('snapshot', 'Requisicao de snapshot', {
    month_ref: monthRef,
    scenario_id: scenarioId,
    force,
    rules_version_id: rulesVersionId || 'auto',
    filters
  });

  if (!isValidMonth(monthRef)) {
    logWarn('snapshot', 'Parametro yyyy_mm invalido', { month_ref: monthRef });
    return res.status(400).json({ error: 'yyyy_mm inválido' });
  }

  try {
    if (!force && !hasFilters) {
      const cached = await getSnapshotCached({ monthRef, scenarioId });
      if (cached && isSnapshotCompatible(cached)) {
        logInfo('snapshot', 'Snapshot servido do cache', { month_ref: monthRef, scenario_id: scenarioId });
        return res.json(cached);
      }
    }
    const snapshot = await buildMonthlySnapshot({
      monthRef,
      scenarioId,
      force,
      rulesVersionId,
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

export default router;
