import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config.js';
import { runIngestion } from './ingest/ingestService.js';
import { logInfo, logWarn } from './utils/logger.js';
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
  logInfo('server', 'Scheduler ativo. Cron configurado', { cron: config.scheduler.cron });
  cron.schedule(config.scheduler.cron, async () => {
    try {
      logInfo('server', 'Cron acionado. Iniciando ingestao.');
      await runIngestion();
    } catch (error) {
      console.error('Ingestion failed:', error.message);
    }
  });
} else {
  logWarn('server', 'Scheduler desativado. Ingestão manual.');
}

app.listen(config.port, () => {
  logInfo('server', `Middleware no ar na porta ${config.port}`);
});
