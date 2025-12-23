import express from 'express';
import { query } from '../db.js';
import { config } from '../config.js';
import { toReais } from '../utils/money.js';
import { buildStatusFilter } from '../utils/status.js';
import { logError, logInfo } from '../utils/logger.js';

const router = express.Router();
const isValidMonth = (value) => /^\d{4}-\d{2}$/.test(value);

const toReaisDb = (value) => toReais(value, config.money?.dbUnit || 'centavos');

const buildContractsScope = (monthRef) => {
  const params = [monthRef];
  const conditions = ['month_ref = $1'];
  const statusFilter = buildStatusFilter(params, config.contractStatus);
  if (statusFilter) {
    conditions.push(statusFilter);
  }
  return { params, conditions };
};

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

const resolveQualityStatus = ({ status, freshnessMinutes, exceptions }) => {
  if (status === 'FAILED') {
    return { level: 'critical', reason: 'Falha na ingestão. Verifique credenciais.' };
  }
  if (status === 'RUNNING') {
    return { level: 'attention', reason: 'Processamento em andamento.' };
  }
  if (status === 'STALE_DATA') {
    return { level: 'attention', reason: 'Coleta marcada como desatualizada.' };
  }

  if (freshnessMinutes === null) {
    return { level: 'critical', reason: 'Sem ingestão registrada.' };
  }
  if (freshnessMinutes >= 120) {
    return { level: 'critical', reason: `Dados desatualizados há ${freshnessMinutes} min.` };
  }
  if (freshnessMinutes >= 60) {
    return { level: 'attention', reason: `Dados atualizados há ${freshnessMinutes} min.` };
  }

  const unknown = exceptions.find((item) => item.type === 'unknown_seller' && item.count > 0);
  if (unknown) {
    return { level: 'critical', reason: `${unknown.count} contratos sem vendedor (ranking distorcido).` };
  }
  const missing = exceptions.find(
    (item) => item.type === 'missing_value' && item.count > 0
  );
  if (missing) {
    return { level: 'attention', reason: `${missing.count} contratos sem valor informado.` };
  }
  const missingProduct = exceptions.find(
    (item) => item.type === 'missing_product' && item.count > 0
  );
  if (missingProduct) {
    return { level: 'attention', reason: `${missingProduct.count} contratos sem produto.` };
  }

  return { level: 'ok', reason: 'Dados consistentes para decisões.' };
};

router.get('/', async (_req, res) => {
  try {
    logInfo('server', 'Consulta de status solicitada');
    const latest = await query(
      'SELECT status, finished_at FROM ingestion_runs ORDER BY started_at DESC LIMIT 1'
    );
    if (latest.rowCount === 0) {
      return res.json({
        status: 'UNKNOWN',
        last_ingestion_at: null,
        stale_data: false,
        environment: config.env,
        api_base_url: config.apiBaseUrl
      });
    }
    const status = latest.rows[0].status;
    logInfo('server', 'Status enviado', { status });
    return res.json({
      status,
      last_ingestion_at: latest.rows[0].finished_at,
      stale_data: status === 'STALE_DATA',
      environment: config.env,
      api_base_url: config.apiBaseUrl
    });
  } catch (error) {
    logError('server', 'Falha ao consultar status', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

router.get('/data-quality', async (req, res) => {
  const monthRef = req.query.month_ref;
  if (!monthRef || !isValidMonth(monthRef)) {
    return res.status(400).json({ error: 'month_ref inválido (YYYY-MM)' });
  }
  try {
    const { params, conditions } = buildContractsScope(monthRef);
    const result = await query(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN is_invalid THEN 1 ELSE 0 END)::int AS invalid,
              SUM(CASE WHEN is_incomplete THEN 1 ELSE 0 END)::int AS incomplete,
              SUM(CASE WHEN vendedor_id IS NULL OR vendedor_id = '' OR LOWER(vendedor_id) = 'unknown' THEN 1 ELSE 0 END)::int AS unknown_seller,
              SUM(CASE WHEN ramo IS NULL OR ramo = '' THEN 1 ELSE 0 END)::int AS missing_product,
              SUM(CASE WHEN comissao_valor IS NULL OR comissao_valor <= 0 OR premio IS NULL OR premio <= 0 THEN 1 ELSE 0 END)::int AS missing_value,
              SUM(CASE WHEN vendedor_id IS NULL OR vendedor_id = '' OR LOWER(vendedor_id) = 'unknown'
                THEN COALESCE(comissao_valor, premio, 0) ELSE 0 END) AS unknown_seller_impact,
              SUM(CASE WHEN ramo IS NULL OR ramo = '' THEN COALESCE(comissao_valor, premio, 0) ELSE 0 END) AS missing_product_impact,
              SUM(CASE WHEN comissao_valor IS NULL OR comissao_valor <= 0 OR premio IS NULL OR premio <= 0
                THEN COALESCE(comissao_valor, premio, 0) ELSE 0 END) AS missing_value_impact
       FROM contracts_norm
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    const row = result.rows[0] || {};
    const total = Number(row.total || 0);
    const invalid = Number(row.invalid || 0);
    const incomplete = Number(row.incomplete || 0);
    const valid = Math.max(0, total - invalid - incomplete);
    const coveragePct = total > 0 ? Number((valid / total).toFixed(3)) : 0;

    const exceptions = [
      {
        type: 'unknown_seller',
        label: 'Sem vendedor',
        count: Number(row.unknown_seller || 0),
        impact: toReaisDb(row.unknown_seller_impact || 0),
        severity: 'critical',
        action_label: 'Corrigir vendedor'
      },
      {
        type: 'missing_product',
        label: 'Sem produto',
        count: Number(row.missing_product || 0),
        impact: toReaisDb(row.missing_product_impact || 0),
        severity: 'attention',
        action_label: 'Corrigir produto'
      },
      {
        type: 'missing_value',
        label: 'Sem valor',
        count: Number(row.missing_value || 0),
        impact: toReaisDb(row.missing_value_impact || 0),
        severity: 'attention',
        action_label: 'Corrigir valores'
      }
    ];

    const ingestion = await getLatestIngestionStatus();
    const freshnessMinutes = ingestion.finishedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(ingestion.finishedAt).getTime()) / 60000))
      : null;
    const quality = resolveQualityStatus({
      status: ingestion.status,
      freshnessMinutes,
      exceptions
    });

    return res.json({
      month_ref: monthRef,
      freshness_minutes: freshnessMinutes,
      last_ingestion_at: ingestion.finishedAt,
      ingestion_status: ingestion.status,
      contracts_total: total,
      contracts_valid: valid,
      contracts_invalid: invalid,
      contracts_incomplete: incomplete,
      coverage_pct: coveragePct,
      quality_status: quality.level,
      quality_reason: quality.reason,
      exceptions
    });
  } catch (error) {
    logError('server', 'Falha ao calcular data-quality', { error: error.message });
    return res.status(500).json({ error: 'Falha ao calcular qualidade de dados.' });
  }
});

router.get('/exceptions', async (req, res) => {
  const monthRef = req.query.month_ref;
  const type = req.query.type;
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  if (!monthRef || !isValidMonth(monthRef)) {
    return res.status(400).json({ error: 'month_ref inválido (YYYY-MM)' });
  }
  if (!type) {
    return res.status(400).json({ error: 'type obrigatório' });
  }

  const filters = {
    unknown_seller: `(vendedor_id IS NULL OR vendedor_id = '' OR LOWER(vendedor_id) = 'unknown')`,
    missing_product: `(ramo IS NULL OR ramo = '')`,
    missing_value: `(comissao_valor IS NULL OR comissao_valor <= 0 OR premio IS NULL OR premio <= 0)`
  };
  const filter = filters[type];
  if (!filter) {
    return res.status(400).json({ error: 'type inválido' });
  }

  try {
    const { params, conditions } = buildContractsScope(monthRef);
    conditions.push(filter);
    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM contracts_norm
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    const total = Number(countResult.rows[0]?.total || 0);

    params.push(limit);
    params.push(offset);
    const result = await query(
      `SELECT contract_id,
              segurado_nome,
              vendedor_id,
              ramo,
              premio,
              comissao_valor,
              status,
              quality_flags
       FROM contracts_norm
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(comissao_valor, premio, 0) DESC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const items = result.rows.map((row) => ({
      contract_id: row.contract_id,
      segurado_nome: row.segurado_nome,
      vendedor_id: row.vendedor_id,
      ramo: row.ramo,
      premio: toReaisDb(row.premio),
      comissao_valor: toReaisDb(row.comissao_valor),
      impact: toReaisDb(row.comissao_valor || row.premio || 0),
      status: row.status,
      quality_flags: row.quality_flags || []
    }));

    return res.json({ type, total, items, limit, offset });
  } catch (error) {
    logError('server', 'Falha ao listar excecoes', { error: error.message });
    return res.status(500).json({ error: 'Falha ao listar exceções.' });
  }
});

export default router;
