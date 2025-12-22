import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config.js';
import { runIngestion } from './ingest/ingestService.js';
import adminRoutes from './routes/admin.js';
import snapshotRoutes from './routes/snapshots.js';
import renewalRoutes from './routes/renewals.js';
import crossSellRoutes from './routes/crossSell.js';
import statusRoutes from './routes/status.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/admin', adminRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/renewals', renewalRoutes);
app.use('/api/cross-sell', crossSellRoutes);
app.use('/api/status', statusRoutes);

if (config.scheduler.enabled) {
  cron.schedule(config.scheduler.cron, async () => {
    try {
      await runIngestion();
    } catch (error) {
      console.error('Ingestion failed:', error.message);
    }
  });
}

app.listen(config.port, () => {
  console.log(`Middleware running on port ${config.port}`);
});
