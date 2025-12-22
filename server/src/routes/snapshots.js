import express from 'express';
import { buildMonthlySnapshot, getSnapshotCached } from '../services/snapshotService.js';

const router = express.Router();

const isValidMonth = (value) => /^\d{4}-\d{2}$/.test(value);

router.get('/month', async (req, res) => {
  const monthRef = req.query.yyyy_mm;
  const scenarioId = req.query.scenario_id || null;
  const rulesVersionId = req.query.rules_version_id || null;
  const force = req.query.force_reprocess === 'true';

  if (!isValidMonth(monthRef)) {
    return res.status(400).json({ error: 'yyyy_mm inválido' });
  }

  try {
    if (!force) {
      const cached = await getSnapshotCached({ monthRef, scenarioId });
      if (cached) {
        return res.json(cached);
      }
    }
    const snapshot = await buildMonthlySnapshot({ monthRef, scenarioId, force, rulesVersionId });
    return res.json(snapshot);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
