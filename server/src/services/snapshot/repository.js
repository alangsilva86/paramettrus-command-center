import { query } from '../../db.js';
import { buildContractsFilters, buildContractsRangeFilters } from './filters.js';

export const fetchAvailableMonthBounds = async () => {
  const result = await query('SELECT MIN(month_ref) AS min_ref, MAX(month_ref) AS max_ref FROM contracts_norm');
  const row = result.rows[0] || {};
  return {
    min: row.min_ref || null,
    max: row.max_ref || null
  };
};

export const fetchCurveShare = async (day, curveId) => {
  const result = await query(
    'SELECT cum_share FROM month_curve WHERE curve_id = $1 AND day = $2',
    [curveId, day]
  );
  if (result.rowCount === 0) return null;
  return Number(result.rows[0].cum_share);
};

export const fetchLatestIngestionStatus = async () => {
  const result = await query(
    'SELECT status, finished_at FROM ingestion_runs ORDER BY started_at DESC LIMIT 1'
  );
  if (result.rowCount === 0) return { status: 'UNKNOWN', finishedAt: null };
  return {
    status: result.rows[0].status,
    finishedAt: result.rows[0].finished_at
  };
};

export const fetchContractsForMonth = async ({ monthRef, includeIncomplete = false, filters = {} }) => {
  const { conditions, params } = buildContractsFilters({
    monthRef,
    includeIncomplete,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const result = await query(
    `SELECT *
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  return result.rows;
};

export const fetchDataCoverageCountsForMonth = async (monthRef) => {
  const result = await query(
    `SELECT COUNT(*)::int AS total,
            SUM(CASE WHEN is_invalid THEN 1 ELSE 0 END)::int AS invalid,
            SUM(CASE WHEN is_incomplete THEN 1 ELSE 0 END)::int AS incomplete
     FROM contracts_norm
     WHERE month_ref = $1`,
    [monthRef]
  );
  return result.rows[0] || { total: 0, invalid: 0, incomplete: 0 };
};

export const fetchDataCoverageCountsForPeriod = async (startMonth, endMonth) => {
  const result = await query(
    `SELECT COUNT(*)::int AS total,
            SUM(CASE WHEN is_invalid THEN 1 ELSE 0 END)::int AS invalid,
            SUM(CASE WHEN is_incomplete THEN 1 ELSE 0 END)::int AS incomplete
     FROM contracts_norm
     WHERE month_ref >= $1 AND month_ref <= $2`,
    [startMonth, endMonth]
  );
  return result.rows[0] || { total: 0, invalid: 0, incomplete: 0 };
};

export const fetchDataSources = async ({ startDate, endDate }) => {
  const result = await query(
    `SELECT source, COUNT(*)::int AS count
     FROM contracts_raw
     WHERE fetched_at >= $1 AND fetched_at < $2
     GROUP BY source
     ORDER BY count DESC`,
    [startDate, endDate]
  );
  return result.rows;
};

export const fetchFilterOptionsForMonth = async (monthRef) => {
  const { conditions, params } = buildContractsFilters({
    monthRef,
    includeIncomplete: true
  });
  const vendors = await query(
    `SELECT DISTINCT vendedor_id
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')} AND vendedor_id IS NOT NULL AND vendedor_id <> ''
     ORDER BY vendedor_id`,
    params
  );
  const ramoParams = [...params];
  const ramos = await query(
    `SELECT DISTINCT ramo
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')} AND ramo IS NOT NULL
     ORDER BY ramo`,
    ramoParams
  );
  return {
    vendors: vendors.rows.map((row) => row.vendedor_id).filter(Boolean),
    ramos: ramos.rows.map((row) => row.ramo).filter(Boolean)
  };
};

export const fetchFilterOptionsForPeriod = async (startMonth, endMonth) => {
  const { conditions, params } = buildContractsRangeFilters({
    startMonth,
    endMonth,
    includeIncomplete: true
  });
  const vendors = await query(
    `SELECT DISTINCT vendedor_id
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')} AND vendedor_id IS NOT NULL AND vendedor_id <> ''
     ORDER BY vendedor_id`,
    params
  );
  const ramoParams = [...params];
  const ramos = await query(
    `SELECT DISTINCT ramo
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')} AND ramo IS NOT NULL
     ORDER BY ramo`,
    ramoParams
  );
  return {
    vendors: vendors.rows.map((row) => row.vendedor_id).filter(Boolean),
    ramos: ramos.rows.map((row) => row.ramo).filter(Boolean)
  };
};

export const fetchMonthlyAggregates = async ({ monthRef, filters = {}, cutoffDate = null }) => {
  const { conditions, params } = buildContractsFilters({
    monthRef,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo,
    cutoffDate
  });
  const result = await query(
    `SELECT COUNT(DISTINCT contract_id)::int AS count,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total,
            COALESCE(SUM(premio), 0) AS premio_total
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  return result.rows[0] || { count: 0, comissao_total: 0, premio_total: 0 };
};

export const fetchPeriodAggregates = async ({ startMonth, endMonth, filters = {}, cutoffDate = null }) => {
  const { conditions, params } = buildContractsRangeFilters({
    startMonth,
    endMonth,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo,
    cutoffDate
  });
  const result = await query(
    `SELECT COUNT(DISTINCT contract_id)::int AS count,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total,
            COALESCE(SUM(premio), 0) AS premio_total
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  return result.rows[0] || { count: 0, comissao_total: 0, premio_total: 0 };
};

export const fetchDailyTrendRowsForMonth = async ({ monthRef, filters = {}, startKey, endKey }) => {
  const { conditions, params } = buildContractsFilters({
    monthRef,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  params.push(startKey);
  conditions.push(`data_efetivacao >= $${params.length}`);
  params.push(endKey);
  conditions.push(`data_efetivacao <= $${params.length}`);
  conditions.push('data_efetivacao IS NOT NULL');

  const result = await query(
    `SELECT data_efetivacao::date AS day,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total,
            COALESCE(SUM(premio), 0) AS premio_total
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     GROUP BY day
     ORDER BY day`,
    params
  );
  return result.rows;
};

export const fetchDailyTrendRowsForPeriod = async ({
  startMonth,
  endMonth,
  filters = {},
  startKey,
  endKey
}) => {
  const { conditions, params } = buildContractsRangeFilters({
    startMonth,
    endMonth,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  params.push(startKey);
  conditions.push(`data_efetivacao >= $${params.length}`);
  params.push(endKey);
  conditions.push(`data_efetivacao <= $${params.length}`);
  conditions.push('data_efetivacao IS NOT NULL');

  const result = await query(
    `SELECT data_efetivacao::date AS day,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total,
            COALESCE(SUM(premio), 0) AS premio_total
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     GROUP BY day
     ORDER BY day`,
    params
  );
  return result.rows;
};

export const fetchLeaderboardRows = async ({ monthRef, scenarioId, filters = {} }) => {
  const baseParams = [monthRef, scenarioId || null];
  const baseConditions = ['l.month_ref = $1', 'l.scenario_id IS NOT DISTINCT FROM $2'];
  if (filters.vendorId) {
    baseParams.push(filters.vendorId);
    baseConditions.push(`l.vendedor_id = $${baseParams.length}`);
  }
  const { conditions: contractConditions, params } = buildContractsFilters({
    monthRef,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo,
    tableAlias: 'c',
    params: baseParams
  });
  const mergedConditions = [...baseConditions, ...contractConditions];

  const result = await query(
    `SELECT l.contract_id,
            l.vendedor_id,
            l.xp_total,
            l.reasons,
            c.comissao_valor
     FROM xp_ledger l
     JOIN contracts_norm c ON c.contract_id = l.contract_id AND c.month_ref = l.month_ref
     WHERE ${mergedConditions.join(' AND ')}`,
    params
  );
  return result.rows;
};

export const fetchLeaderboardRowsForPeriod = async ({ startMonth, endMonth, filters = {} }) => {
  const params = [startMonth, endMonth];
  const conditions = ['l.month_ref >= $1', 'l.month_ref <= $2', 'l.scenario_id IS NULL'];
  if (filters.vendorId) {
    params.push(filters.vendorId);
    conditions.push(`l.vendedor_id = $${params.length}`);
  }
  if (filters.ramo) {
    params.push(filters.ramo);
    conditions.push(`c.ramo = $${params.length}`);
  }

  const result = await query(
    `SELECT l.contract_id,
            l.vendedor_id,
            l.xp_total,
            l.reasons,
            c.comissao_valor
     FROM xp_ledger l
     JOIN contracts_norm c ON c.contract_id = l.contract_id AND c.month_ref = l.month_ref
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  return result.rows;
};

export const fetchRadarRamoStatsForPeriod = async ({ startMonth, endMonth, filters = {} }) => {
  const { conditions, params } = buildContractsRangeFilters({
    startMonth,
    endMonth,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const result = await query(
    `SELECT ramo,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total,
            COALESCE(SUM(premio), 0) AS premio_total,
            COUNT(DISTINCT contract_id)::int AS contracts_count
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     GROUP BY ramo`,
    params
  );
  return result.rows;
};

export const fetchRadarInsurerStatsForPeriod = async ({ startMonth, endMonth, filters = {} }) => {
  const { conditions, params } = buildContractsRangeFilters({
    startMonth,
    endMonth,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const result = await query(
    `SELECT seguradora,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     GROUP BY seguradora`,
    params
  );
  return result.rows;
};

export const fetchMixAggregate = async ({ monthRef, filters = {}, field }) => {
  const { conditions, params } = buildContractsFilters({
    monthRef,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const result = await query(
    `SELECT ${field} AS key,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total,
            COALESCE(SUM(premio), 0) AS premio_total,
            COUNT(DISTINCT contract_id)::int AS contracts_count
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     GROUP BY ${field}`,
    params
  );
  return result.rows;
};

export const fetchMixAggregateForPeriod = async ({ startMonth, endMonth, filters = {}, field }) => {
  const { conditions, params } = buildContractsRangeFilters({
    startMonth,
    endMonth,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const result = await query(
    `SELECT ${field} AS key,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total,
            COALESCE(SUM(premio), 0) AS premio_total,
            COUNT(DISTINCT contract_id)::int AS contracts_count
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     GROUP BY ${field}`,
    params
  );
  return result.rows;
};

export const fetchVendorAggregates = async ({ monthRef, filters = {} }) => {
  const { conditions, params } = buildContractsFilters({
    monthRef,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const result = await query(
    `SELECT vendedor_id,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total,
            COALESCE(SUM(premio), 0) AS premio_total,
            COUNT(DISTINCT contract_id)::int AS sales_count
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     GROUP BY vendedor_id`,
    params
  );
  return result.rows;
};

export const fetchVendorAggregatesForPeriod = async ({ startMonth, endMonth, filters = {} }) => {
  const { conditions, params } = buildContractsRangeFilters({
    startMonth,
    endMonth,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const result = await query(
    `SELECT vendedor_id,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total,
            COALESCE(SUM(premio), 0) AS premio_total,
            COUNT(DISTINCT contract_id)::int AS sales_count
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     GROUP BY vendedor_id`,
    params
  );
  return result.rows;
};

export const fetchCustomersMonoprodutoTotals = async () => {
  const result = await query(
    'SELECT COUNT(*)::int AS total, SUM(CASE WHEN is_monoproduto THEN 1 ELSE 0 END)::int AS mono FROM customers'
  );
  return result.rows[0] || { total: 0, mono: 0 };
};

export const fetchVendorCpfs = async (vendorId) => {
  const cpfRows = await query(
    `SELECT DISTINCT cpf_cnpj
     FROM contracts_norm
     WHERE vendedor_id = $1 AND cpf_cnpj IS NOT NULL`,
    [vendorId]
  );
  return cpfRows.rows.map((row) => row.cpf_cnpj).filter(Boolean);
};

export const fetchCustomersMonoprodutoTotalsForCpfs = async (cpfList) => {
  const result = await query(
    `SELECT COUNT(*)::int AS total, SUM(CASE WHEN is_monoproduto THEN 1 ELSE 0 END)::int AS mono
     FROM customers
     WHERE cpf_cnpj = ANY($1)`,
    [cpfList]
  );
  return result.rows[0] || { total: 0, mono: 0 };
};

export const insertSnapshotRow = async ({
  monthRef,
  scenarioId,
  rulesVersionId,
  data,
  isScenario,
  staleData
}) => {
  await query(
    `INSERT INTO snapshots_month (month_ref, scenario_id, rules_version_id, data, is_scenario, stale_data)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [monthRef, scenarioId, rulesVersionId, JSON.stringify(data), Boolean(isScenario), staleData]
  );
};

export const fetchSnapshotCached = async ({ monthRef, scenarioId = null, rulesVersionId = null }) => {
  const params = [monthRef, scenarioId || null];
  const conditions = ['month_ref = $1', 'scenario_id IS NOT DISTINCT FROM $2'];
  if (rulesVersionId) {
    params.push(rulesVersionId);
    conditions.push(`rules_version_id = $${params.length}`);
  }
  const result = await query(
    `SELECT data
     FROM snapshots_month
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT 1`,
    params
  );
  if (result.rowCount === 0) return null;
  return result.rows[0].data;
};

export const fetchLatestSnapshotRulesVersionId = async (monthRef) => {
  const result = await query(
    `SELECT rules_version_id
     FROM snapshots_month
     WHERE month_ref = $1 AND scenario_id IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [monthRef]
  );
  if (result.rowCount === 0) return null;
  return result.rows[0].rules_version_id;
};

export const fetchScenarioSnapshots = async ({ monthRef }) => {
  const result = await query(
    `SELECT scenario_id, rules_version_id, created_at, data
     FROM snapshots_month
     WHERE month_ref = $1 AND is_scenario = TRUE
     ORDER BY created_at DESC
     LIMIT 10`,
    [monthRef]
  );
  return result.rows;
};

export const insertAuditLog = async ({ eventType, payload }) => {
  await query(
    `INSERT INTO audit_logs (event_type, payload)
     VALUES ($1, $2::jsonb)`,
    [eventType, JSON.stringify(payload)]
  );
};
