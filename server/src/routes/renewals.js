import express from 'express';
import { listRenewals } from '../services/renewalService.js';

const router = express.Router();

router.get('/list', async (req, res) => {
  const windowDays = Number(req.query.window || 15);
  try {
    const list = await listRenewals({ windowDays });
    res.json({ window_days: windowDays, items: list });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
