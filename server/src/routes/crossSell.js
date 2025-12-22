import express from 'express';
import { getCrossSellSummary } from '../services/crossSellService.js';

const router = express.Router();

router.get('/auto-sem-vida', async (_req, res) => {
  try {
    const summary = await getCrossSellSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
