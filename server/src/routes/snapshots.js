import express from 'express';
import { buildMonthlySnapshot, getSnapshotCached } from '../services/snapshotService.js';
import { logError, logInfo, logWarn } from '../utils/logger.js';

const router = express.Router();

const isValidMonth = (value) => /^\d{4}-\d{2}$/.test(value);

router.get('/month', async (req, res) => {
  const monthRef = req.query.yyyy_mm;
  const scenarioId = req.query.scenario_id || null;
  const rulesVersionId = req.query.rules_version_id || null;
  const force = req.query.force_reprocess === 'true';

  logInfo('snapshot', 'Requisicao de snapshot', {
    month_ref: monthRef,
    scenario_id: scenarioId,
    force,
    rules_version_id: rulesVersionId || 'auto'
  });

  if (!isValidMonth(monthRef)) {
    logWarn('snapshot', 'Parametro yyyy_mm invalido', { month_ref: monthRef });
    return res.status(400).json({ error: 'yyyy_mm inválido' });
  }

  try {
    if (!force) {
      const cached = await getSnapshotCached({ monthRef, scenarioId });
      if (cached) {
        logInfo('snapshot', 'Snapshot servido do cache', { month_ref: monthRef, scenario_id: scenarioId });
        return res.json(cached);
      }
    }
    const snapshot = await buildMonthlySnapshot({ monthRef, scenarioId, force, rulesVersionId });
    return res.json(snapshot);
  } catch (error) {
    logError('snapshot', 'Falha ao montar snapshot', {
      month_ref: monthRef,
      error: error.message
    });
    return res.status(500).json({ error: error.message });
  }
});

export default router;
