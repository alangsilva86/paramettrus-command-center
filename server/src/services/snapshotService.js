import { query } from '../db.js';
import { config } from '../config.js';
import {
  addDays,
  countBusinessDays,
  endOfMonth,
  formatDate,
  formatMonthRef,
  startOfMonth
} from '../utils/date.js';
import { toReais } from '../utils/money.js';
import { buildStatusFilter } from '../utils/status.js';
import { computeLedgerForMonth } from './ledgerService.js';
import { getRulesVersionById, getRulesVersionForDate } from './rulesService.js';
import { getRenewalMetrics } from './renewalService.js';
import { logInfo, logSuccess, logWarn } from '../utils/logger.js';

export const SNAPSHOT_VERSION = 2;
export const SNAPSHOT_MONEY_UNIT = config.money?.dbUnit || 'centavos';

const toReaisDb = (value) => toReais(value, SNAPSHOT_MONEY_UNIT);
const isSnapshotVersionCompatible = (snapshot) =>
  snapshot?.snapshot_version === SNAPSHOT_VERSION &&
  snapshot?.money_unit === SNAPSHOT_MONEY_UNIT;

const shiftMonthRef = (monthRef, deltaMonths) => {
  const base = startOfMonth(monthRef);
  const shifted = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + deltaMonths, 1));
  return formatMonthRef(shifted);
};

const monthRefToIndex = (monthRef) => {
  const [year, month] = monthRef.split('-').map(Number);
  return year * 12 + (month - 1);
};

const normalizeMonthRange = (startMonth, endMonth) => {
  if (monthRefToIndex(startMonth) <= monthRefToIndex(endMonth)) {
    return { startMonth, endMonth };
  }
  return { startMonth: endMonth, endMonth: startMonth };
};

const listMonthRefs = (startMonth, endMonth) => {
  const startIdx = monthRefToIndex(startMonth);
  const endIdx = monthRefToIndex(endMonth);
  const months = [];
  for (let idx = startIdx; idx <= endIdx; idx += 1) {
    const year = Math.floor(idx / 12);
    const month = String((idx % 12) + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
  }
  return months;
};

const shiftDateByMonths = (date, deltaMonths) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(year, month + deltaMonths, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
};

const buildContractsFilters = ({
  monthRef,
  includeIncomplete = false,
  vendorId = null,
  ramo = null,
  cutoffDate = null
}) => {
  const conditions = ['month_ref = $1', 'is_invalid = FALSE'];
  const params = [monthRef];
  if (!includeIncomplete) {
    conditions.push('is_incomplete = FALSE');
  }
  const statusFilter = buildStatusFilter(params, config.contractStatus);
  if (statusFilter) {
    conditions.push(statusFilter);
  }
  if (vendorId) {
    params.push(vendorId);
    conditions.push(`vendedor_id = $${params.length}`);
  }
  if (ramo) {
    params.push(ramo);
    conditions.push(`ramo = $${params.length}`);
  }
  if (cutoffDate) {
    params.push(cutoffDate);
    conditions.push(`(data_efetivacao IS NULL OR data_efetivacao <= $${params.length})`);
  }
  return { conditions, params };
};

const buildContractsRangeFilters = ({
  startMonth,
  endMonth,
  includeIncomplete = false,
  vendorId = null,
  ramo = null,
  cutoffDate = null
}) => {
  const conditions = ['month_ref >= $1', 'month_ref <= $2', 'is_invalid = FALSE'];
  const params = [startMonth, endMonth];
  if (!includeIncomplete) {
    conditions.push('is_incomplete = FALSE');
  }
  const statusFilter = buildStatusFilter(params, config.contractStatus);
  if (statusFilter) {
    conditions.push(statusFilter);
  }
  if (vendorId) {
    params.push(vendorId);
    conditions.push(`vendedor_id = $${params.length}`);
  }
  if (ramo) {
    params.push(ramo);
    conditions.push(`ramo = $${params.length}`);
  }
  if (cutoffDate) {
    params.push(cutoffDate);
    conditions.push(`(data_efetivacao IS NULL OR data_efetivacao <= $${params.length})`);
  }
  return { conditions, params };
};

const fetchContractsForMonth = async (monthRef, includeIncomplete = false, filters = {}) => {
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

const getCurveShare = async (day, curveId) => {
  const result = await query(
    'SELECT cum_share FROM month_curve WHERE curve_id = $1 AND day = $2',
    [curveId, day]
  );
  if (result.rowCount === 0) return null;
  return Number(result.rows[0].cum_share);
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

const getFilterOptions = async (monthRef) => {
  const baseParams = [monthRef];
  const baseConditions = ['month_ref = $1', 'is_invalid = FALSE'];
  const statusFilter = buildStatusFilter(baseParams, config.contractStatus);
  if (statusFilter) {
    baseConditions.push(statusFilter);
  }
  const vendors = await query(
    `SELECT DISTINCT vendedor_id
     FROM contracts_norm
     WHERE ${baseConditions.join(' AND ')} AND vendedor_id IS NOT NULL AND vendedor_id <> ''
     ORDER BY vendedor_id`,
    baseParams
  );
  const ramoParams = [...baseParams];
  const ramos = await query(
    `SELECT DISTINCT ramo
     FROM contracts_norm
     WHERE ${baseConditions.join(' AND ')} AND ramo IS NOT NULL
     ORDER BY ramo`,
    ramoParams
  );
  return {
    vendors: vendors.rows.map((row) => row.vendedor_id).filter(Boolean),
    ramos: ramos.rows.map((row) => row.ramo).filter(Boolean)
  };
};

const getFilterOptionsForPeriod = async (startMonth, endMonth) => {
  const baseParams = [startMonth, endMonth];
  const baseConditions = ['month_ref >= $1', 'month_ref <= $2', 'is_invalid = FALSE'];
  const statusFilter = buildStatusFilter(baseParams, config.contractStatus);
  if (statusFilter) {
    baseConditions.push(statusFilter);
  }
  const vendors = await query(
    `SELECT DISTINCT vendedor_id
     FROM contracts_norm
     WHERE ${baseConditions.join(' AND ')} AND vendedor_id IS NOT NULL AND vendedor_id <> ''
     ORDER BY vendedor_id`,
    baseParams
  );
  const ramoParams = [...baseParams];
  const ramos = await query(
    `SELECT DISTINCT ramo
     FROM contracts_norm
     WHERE ${baseConditions.join(' AND ')} AND ramo IS NOT NULL
     ORDER BY ramo`,
    ramoParams
  );
  return {
    vendors: vendors.rows.map((row) => row.vendedor_id).filter(Boolean),
    ramos: ramos.rows.map((row) => row.ramo).filter(Boolean)
  };
};

const getDataCoverage = async (monthRef) => {
  const counts = await query(
    `SELECT COUNT(*)::int AS total,
            SUM(CASE WHEN is_invalid THEN 1 ELSE 0 END)::int AS invalid,
            SUM(CASE WHEN is_incomplete THEN 1 ELSE 0 END)::int AS incomplete
     FROM contracts_norm
     WHERE month_ref = $1`,
    [monthRef]
  );
  const monthStart = startOfMonth(monthRef);
  const monthEnd = endOfMonth(monthRef);
  const sources = await query(
    `SELECT source, COUNT(*)::int AS count
     FROM contracts_raw
     WHERE fetched_at >= $1 AND fetched_at < $2
     GROUP BY source
     ORDER BY count DESC`,
    [monthStart, addDays(monthEnd, 1)]
  );
  const status = await getLatestIngestionStatus();
  const total = Number(counts.rows[0]?.total || 0);
  const invalid = Number(counts.rows[0]?.invalid || 0);
  const incomplete = Number(counts.rows[0]?.incomplete || 0);
  const valid = Math.max(0, total - invalid);
  const validPct = total > 0 ? valid / total : 0;
  const confidence =
    status.status === 'STALE_DATA' || status.status === 'FAILED'
      ? 'low'
      : validPct < 0.9
      ? 'medium'
      : 'high';

  return {
    contracts_total: total,
    contracts_valid: valid,
    contracts_invalid: invalid,
    contracts_incomplete: incomplete,
    valid_pct: Number(validPct.toFixed(3)),
    sources: sources.rows.map((row) => ({
      source: row.source,
      count: Number(row.count || 0)
    })),
    last_ingestion_at: status.finishedAt,
    ingestion_status: status.status,
    confidence
  };
};

const getDataCoverageForPeriod = async (startMonth, endMonth) => {
  const counts = await query(
    `SELECT COUNT(*)::int AS total,
            SUM(CASE WHEN is_invalid THEN 1 ELSE 0 END)::int AS invalid,
            SUM(CASE WHEN is_incomplete THEN 1 ELSE 0 END)::int AS incomplete
     FROM contracts_norm
     WHERE month_ref >= $1 AND month_ref <= $2`,
    [startMonth, endMonth]
  );
  const rangeStart = startOfMonth(startMonth);
  const rangeEnd = endOfMonth(endMonth);
  const sources = await query(
    `SELECT source, COUNT(*)::int AS count
     FROM contracts_raw
     WHERE fetched_at >= $1 AND fetched_at < $2
     GROUP BY source
     ORDER BY count DESC`,
    [rangeStart, addDays(rangeEnd, 1)]
  );
  const status = await getLatestIngestionStatus();
  const total = Number(counts.rows[0]?.total || 0);
  const invalid = Number(counts.rows[0]?.invalid || 0);
  const incomplete = Number(counts.rows[0]?.incomplete || 0);
  const valid = Math.max(0, total - invalid);
  const validPct = total > 0 ? valid / total : 0;
  const confidence =
    status.status === 'STALE_DATA' || status.status === 'FAILED'
      ? 'low'
      : validPct < 0.9
      ? 'medium'
      : 'high';

  return {
    contracts_total: total,
    contracts_valid: valid,
    contracts_invalid: invalid,
    contracts_incomplete: incomplete,
    valid_pct: Number(validPct.toFixed(3)),
    sources: sources.rows.map((row) => ({
      source: row.source,
      count: Number(row.count || 0)
    })),
    last_ingestion_at: status.finishedAt,
    ingestion_status: status.status,
    confidence
  };
};

const getMonthlyAggregates = async ({ monthRef, filters = {}, cutoffDate = null } = {}) => {
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
  const row = result.rows[0] || {};
  const count = Number(row.count || 0);
  const comissaoTotal = toReaisDb(row.comissao_total || 0);
  const premioTotal = toReaisDb(row.premio_total || 0);
  const margemPct = premioTotal > 0 ? (comissaoTotal / premioTotal) * 100 : 0;
  const ticketMedio = count > 0 ? premioTotal / count : 0;
  return { count, comissaoTotal, premioTotal, margemPct, ticketMedio };
};

const getPeriodAggregates = async ({ startMonth, endMonth, filters = {}, cutoffDate = null } = {}) => {
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
  const row = result.rows[0] || {};
  const count = Number(row.count || 0);
  const comissaoTotal = toReaisDb(row.comissao_total || 0);
  const premioTotal = toReaisDb(row.premio_total || 0);
  const margemPct = premioTotal > 0 ? (comissaoTotal / premioTotal) * 100 : 0;
  const ticketMedio = count > 0 ? premioTotal / count : 0;
  return { count, comissaoTotal, premioTotal, margemPct, ticketMedio };
};

const getDailyTrend = async ({ monthRef, filters = {}, referenceDate, days = 14 }) => {
  const start = addDays(referenceDate, -(days - 1));
  const { conditions, params } = buildContractsFilters({
    monthRef,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const startKey = formatDate(start);
  const endKey = formatDate(referenceDate);
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

  const map = new Map(
    result.rows.map((row) => [
      formatDate(row.day),
      {
        comissao: toReaisDb(row.comissao_total || 0),
        premio: toReaisDb(row.premio_total || 0)
      }
    ])
  );
  const series = [];
  for (let i = 0; i < days; i += 1) {
    const day = addDays(start, i);
    const key = formatDate(day);
    const entry = map.get(key) || { comissao: 0, premio: 0 };
    series.push({ date: key, comissao: entry.comissao, premio: entry.premio });
  }
  return series;
};

const getDailyTrendForPeriod = async ({ startMonth, endMonth, filters = {}, referenceDate, days = 14 }) => {
  const start = addDays(referenceDate, -(days - 1));
  const { conditions, params } = buildContractsRangeFilters({
    startMonth,
    endMonth,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const startKey = formatDate(start);
  const endKey = formatDate(referenceDate);
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

  const map = new Map(
    result.rows.map((row) => [
      formatDate(row.day),
      {
        comissao: toReaisDb(row.comissao_total || 0),
        premio: toReaisDb(row.premio_total || 0)
      }
    ])
  );
  const series = [];
  for (let i = 0; i < days; i += 1) {
    const day = addDays(start, i);
    const key = formatDate(day);
    const entry = map.get(key) || { comissao: 0, premio: 0 };
    series.push({ date: key, comissao: entry.comissao, premio: entry.premio });
  }
  return series;
};

const getLeaderboard = async (monthRef, scenarioId, filters = {}) => {
  const ledgerParams = [monthRef, scenarioId || null];
  let ledgerFilter = '';
  if (filters.vendorId) {
    ledgerParams.push(filters.vendorId);
    ledgerFilter = ` AND vendedor_id = $${ledgerParams.length}`;
  }
  const ledger = await query(
    `SELECT * FROM xp_ledger
     WHERE month_ref = $1 AND scenario_id IS NOT DISTINCT FROM $2${ledgerFilter}`,
    ledgerParams
  );

  const { conditions, params } = buildContractsFilters({
    monthRef,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const contracts = await query(
    `SELECT contract_id, comissao_valor
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  const commByContract = new Map(
    contracts.rows.map((row) => [row.contract_id, toReaisDb(row.comissao_valor || 0)])
  );

  const vendorMap = new Map();
  ledger.rows.forEach((entry) => {
    if (!commByContract.has(entry.contract_id)) return;
    if (!vendorMap.has(entry.vendedor_id)) {
      vendorMap.set(entry.vendedor_id, {
        vendedor_id: entry.vendedor_id,
        xp: 0,
        comissao: 0,
        sales_count: 0,
        badges: new Set(),
        combos: 0,
        salvamentos: 0
      });
    }
    const vendor = vendorMap.get(entry.vendedor_id);
    vendor.xp += Number(entry.xp_total);
    vendor.comissao += commByContract.get(entry.contract_id) || 0;
    vendor.sales_count += 1;
    if (entry.reasons?.includes('COMBO_BREAKER')) vendor.combos += 1;
    if (entry.reasons?.includes('SALVAMENTO_D5')) vendor.salvamentos += 1;
  });

  vendorMap.forEach((vendor) => {
    if (vendor.combos >= 1) vendor.badges.add('COMBO');
    if (vendor.salvamentos >= 1) vendor.badges.add('DEFENSOR');
  });

  return Array.from(vendorMap.values())
    .map((vendor) => ({
      vendedor_id: vendor.vendedor_id,
      xp: vendor.xp,
      comissao: vendor.comissao,
      sales_count: vendor.sales_count,
      badges: Array.from(vendor.badges)
    }))
    .sort((a, b) => b.xp - a.xp);
};

const getLeaderboardForPeriod = async (startMonth, endMonth, filters = {}) => {
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

  const ledger = await query(
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

  const vendorMap = new Map();
  ledger.rows.forEach((entry) => {
    if (!entry.vendedor_id) return;
    if (!vendorMap.has(entry.vendedor_id)) {
      vendorMap.set(entry.vendedor_id, {
        vendedor_id: entry.vendedor_id,
        xp: 0,
        comissao: 0,
        sales_count: 0,
        badges: new Set(),
        combos: 0,
        salvamentos: 0
      });
    }
    const vendor = vendorMap.get(entry.vendedor_id);
    vendor.xp += Number(entry.xp_total || 0);
    vendor.comissao += toReaisDb(entry.comissao_valor || 0);
    vendor.sales_count += 1;
    if (entry.reasons?.includes('COMBO_BREAKER')) vendor.combos += 1;
    if (entry.reasons?.includes('SALVAMENTO_D5')) vendor.salvamentos += 1;
  });

  vendorMap.forEach((vendor) => {
    if (vendor.combos >= 1) vendor.badges.add('COMBO');
    if (vendor.salvamentos >= 1) vendor.badges.add('DEFENSOR');
  });

  return Array.from(vendorMap.values())
    .map((vendor) => ({
      vendedor_id: vendor.vendedor_id,
      xp: vendor.xp,
      comissao: vendor.comissao,
      sales_count: vendor.sales_count,
      badges: Array.from(vendor.badges)
    }))
    .sort((a, b) => b.xp - a.xp);
};

const getRadarData = (contractsRows, blackByRamo) => {
  const ramoStats = new Map();
  const insurerStats = new Map();

  contractsRows.forEach((row) => {
    const ramo = row.ramo;
    if (!ramoStats.has(ramo)) {
      ramoStats.set(ramo, { comm: 0, prem: 0, count: 0, black: 0 });
    }
    const stat = ramoStats.get(ramo);
    stat.comm += toReaisDb(row.comissao_valor);
    stat.prem += toReaisDb(row.premio);
    stat.count += 1;

    const insurer = row.seguradora || 'N/D';
    insurerStats.set(insurer, (insurerStats.get(insurer) || 0) + toReaisDb(row.comissao_valor));
  });

  const insurerValues = Array.from(insurerStats.values());
  const totalComm = insurerValues.reduce((acc, val) => acc + val, 0);
  const topInsurerShare = totalComm > 0 ? Math.max(...insurerValues) / totalComm : 0;

  const bubbleProducts = Array.from(ramoStats.entries()).map(([ramo, stat]) => {
    stat.black = blackByRamo.get(ramo) || 0;
    const retencaoProxy = stat.count > 0 ? 1 - stat.black / stat.count : 0.85;
    return {
      ramo,
      comissao_total: stat.comm,
      comissao_pct_avg: stat.prem > 0 ? (stat.comm / stat.prem) * 100 : 0,
      premio_total: stat.prem,
      retencao_proxy: retencaoProxy
    };
  });

  return { bubbleProducts, topInsurerShare };
};

const getRadarDataForPeriod = async ({ startMonth, endMonth, filters = {}, blackByRamo }) => {
  const { conditions, params } = buildContractsRangeFilters({
    startMonth,
    endMonth,
    includeIncomplete: true,
    vendorId: filters.vendorId,
    ramo: filters.ramo
  });
  const ramoRows = await query(
    `SELECT ramo,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total,
            COALESCE(SUM(premio), 0) AS premio_total,
            COUNT(DISTINCT contract_id)::int AS contracts_count
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     GROUP BY ramo`,
    params
  );
  const insurerRows = await query(
    `SELECT seguradora,
            COALESCE(SUM(comissao_valor), 0) AS comissao_total
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     GROUP BY seguradora`,
    params
  );

  const insurerValues = insurerRows.rows.map((row) => toReaisDb(row.comissao_total || 0));
  const totalComm = insurerValues.reduce((acc, val) => acc + val, 0);
  const topInsurerShare = totalComm > 0 ? Math.max(...insurerValues) / totalComm : 0;

  const bubbleProducts = ramoRows.rows
    .filter((row) => row.ramo)
    .map((row) => {
      const comissaoTotal = toReaisDb(row.comissao_total || 0);
      const premioTotal = toReaisDb(row.premio_total || 0);
      const count = Number(row.contracts_count || 0);
      const blackCount = blackByRamo.get(row.ramo) || 0;
      const retencaoProxy = count > 0 ? 1 - blackCount / count : 0.85;
      return {
        ramo: row.ramo,
        comissao_total: comissaoTotal,
        comissao_pct_avg: premioTotal > 0 ? (comissaoTotal / premioTotal) * 100 : 0,
        premio_total: premioTotal,
        retencao_proxy: retencaoProxy
      };
    });

  return { bubbleProducts, topInsurerShare };
};

const getCustomersMonoprodutoPct = async (vendorId = null) => {
  if (!vendorId) {
    const result = await query(
      'SELECT COUNT(*)::int AS total, SUM(CASE WHEN is_monoproduto THEN 1 ELSE 0 END)::int AS mono FROM customers'
    );
    if (result.rowCount === 0) return 0;
    const { total, mono } = result.rows[0];
    return total > 0 ? mono / total : 0;
  }

  const cpfRows = await query(
    `SELECT DISTINCT cpf_cnpj
     FROM contracts_norm
     WHERE vendedor_id = $1 AND cpf_cnpj IS NOT NULL`,
    [vendorId]
  );
  const cpfList = cpfRows.rows.map((row) => row.cpf_cnpj).filter(Boolean);
  if (!cpfList.length) return 0;
  const result = await query(
    `SELECT COUNT(*)::int AS total, SUM(CASE WHEN is_monoproduto THEN 1 ELSE 0 END)::int AS mono
     FROM customers
     WHERE cpf_cnpj = ANY($1)`,
    [cpfList]
  );
  if (result.rowCount === 0) return 0;
  const { total, mono } = result.rows[0];
  return total > 0 ? mono / total : 0;
};

const getMixAggregate = async ({ monthRef, filters = {}, field }) => {
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
  return result.rows
    .filter((row) => row.key)
    .map((row) => ({
      ...row,
      comissao_total: toReaisDb(row.comissao_total || 0),
      premio_total: toReaisDb(row.premio_total || 0),
      contracts_count: Number(row.contracts_count || 0)
    }));
};

const getMixAggregateForPeriod = async ({ startMonth, endMonth, filters = {}, field }) => {
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
  return result.rows
    .filter((row) => row.key)
    .map((row) => ({
      ...row,
      comissao_total: toReaisDb(row.comissao_total || 0),
      premio_total: toReaisDb(row.premio_total || 0),
      contracts_count: Number(row.contracts_count || 0)
    }));
};

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const buildMixMatrix = (products) => {
  if (!products.length) return [];
  const marginMedian = median(products.map((item) => item.margem_pct));
  const volumeMedian = median(products.map((item) => item.share_comissao));
  return products.map((item) => {
    const highMargin = item.margem_pct >= marginMedian;
    const highVolume = item.share_comissao >= volumeMedian;
    let quadrant = 'LOW_MARGIN_LOW_VOLUME';
    if (highMargin && highVolume) quadrant = 'HIGH_MARGIN_HIGH_VOLUME';
    else if (highMargin && !highVolume) quadrant = 'HIGH_MARGIN_LOW_VOLUME';
    else if (!highMargin && highVolume) quadrant = 'LOW_MARGIN_HIGH_VOLUME';
    return {
      ramo: item.ramo,
      quadrant,
      margem_pct: item.margem_pct,
      volume_share: item.share_comissao,
      risk_pct: item.risk_pct
    };
  });
};

const getMixData = async ({ monthRef, filters = {}, blackByRamo }) => {
  const prevMonthRef = shiftMonthRef(monthRef, -1);
  const [currentProducts, prevProducts, currentInsurers, prevInsurers] = await Promise.all([
    getMixAggregate({ monthRef, filters, field: 'ramo' }),
    getMixAggregate({ monthRef: prevMonthRef, filters, field: 'ramo' }),
    getMixAggregate({ monthRef, filters, field: 'seguradora' }),
    getMixAggregate({ monthRef: prevMonthRef, filters, field: 'seguradora' })
  ]);

  const totalComm = currentProducts.reduce((sum, row) => sum + Number(row.comissao_total || 0), 0);
  const totalPrem = currentProducts.reduce((sum, row) => sum + Number(row.premio_total || 0), 0);
  const prevTotalComm = prevProducts.reduce((sum, row) => sum + Number(row.comissao_total || 0), 0);
  const prevTotalInsComm = prevInsurers.reduce((sum, row) => sum + Number(row.comissao_total || 0), 0);

  const prevProductMap = new Map(prevProducts.map((row) => [row.key, row]));
  const prevInsurerMap = new Map(prevInsurers.map((row) => [row.key, row]));

  const products = currentProducts
    .map((row) => {
      const comissaoTotal = Number(row.comissao_total || 0);
      const premioTotal = Number(row.premio_total || 0);
      const prev = prevProductMap.get(row.key);
      const prevComm = Number(prev?.comissao_total || 0);
      const shareComissao = totalComm > 0 ? comissaoTotal / totalComm : 0;
      const sharePremio = totalPrem > 0 ? premioTotal / totalPrem : 0;
      const prevShare = prevTotalComm > 0 ? prevComm / prevTotalComm : 0;
      const momComissaoPct = prevComm > 0 ? (comissaoTotal - prevComm) / prevComm : 0;
      const count = Number(row.contracts_count || 0);
      const blackCount = blackByRamo.get(row.key) || 0;
      const riskPct = count > 0 ? blackCount / count : 0;
      return {
        ramo: row.key,
        comissao_total: comissaoTotal,
        premio_total: premioTotal,
        margem_pct: premioTotal > 0 ? (comissaoTotal / premioTotal) * 100 : 0,
        share_comissao: shareComissao,
        share_premio: sharePremio,
        mom_comissao_pct: momComissaoPct,
        mom_share_delta: shareComissao - prevShare,
        risk_pct: Number(riskPct.toFixed(3))
      };
    })
    .sort((a, b) => b.comissao_total - a.comissao_total);

  const insurers = currentInsurers
    .map((row) => {
      const comissaoTotal = Number(row.comissao_total || 0);
      const premioTotal = Number(row.premio_total || 0);
      const prev = prevInsurerMap.get(row.key);
      const prevComm = Number(prev?.comissao_total || 0);
      const shareComissao = totalComm > 0 ? comissaoTotal / totalComm : 0;
      const prevShare = prevTotalInsComm > 0 ? prevComm / prevTotalInsComm : 0;
      const momComissaoPct = prevComm > 0 ? (comissaoTotal - prevComm) / prevComm : 0;
      return {
        seguradora: row.key,
        comissao_total: comissaoTotal,
        premio_total: premioTotal,
        margem_pct: premioTotal > 0 ? (comissaoTotal / premioTotal) * 100 : 0,
        share_comissao: shareComissao,
        mom_comissao_pct: momComissaoPct,
        mom_share_delta: shareComissao - prevShare
      };
    })
    .sort((a, b) => b.comissao_total - a.comissao_total)
    .slice(0, 8);

  return {
    products,
    insurers,
    matrix: buildMixMatrix(products)
  };
};

const getMixDataForPeriod = async ({ startMonth, endMonth, filters = {}, blackByRamo }) => {
  const monthsSpan = monthRefToIndex(endMonth) - monthRefToIndex(startMonth) + 1;
  const prevStart = shiftMonthRef(startMonth, -monthsSpan);
  const prevEnd = shiftMonthRef(endMonth, -monthsSpan);

  const [currentProducts, prevProducts, currentInsurers, prevInsurers] = await Promise.all([
    getMixAggregateForPeriod({ startMonth, endMonth, filters, field: 'ramo' }),
    getMixAggregateForPeriod({ startMonth: prevStart, endMonth: prevEnd, filters, field: 'ramo' }),
    getMixAggregateForPeriod({ startMonth, endMonth, filters, field: 'seguradora' }),
    getMixAggregateForPeriod({ startMonth: prevStart, endMonth: prevEnd, filters, field: 'seguradora' })
  ]);

  const totalComm = currentProducts.reduce((sum, row) => sum + Number(row.comissao_total || 0), 0);
  const totalPrem = currentProducts.reduce((sum, row) => sum + Number(row.premio_total || 0), 0);
  const prevTotalComm = prevProducts.reduce((sum, row) => sum + Number(row.comissao_total || 0), 0);
  const prevTotalInsComm = prevInsurers.reduce((sum, row) => sum + Number(row.comissao_total || 0), 0);

  const prevProductMap = new Map(prevProducts.map((row) => [row.key, row]));
  const prevInsurerMap = new Map(prevInsurers.map((row) => [row.key, row]));

  const products = currentProducts
    .map((row) => {
      const comissaoTotal = Number(row.comissao_total || 0);
      const premioTotal = Number(row.premio_total || 0);
      const prev = prevProductMap.get(row.key);
      const prevComm = Number(prev?.comissao_total || 0);
      const shareComissao = totalComm > 0 ? comissaoTotal / totalComm : 0;
      const sharePremio = totalPrem > 0 ? premioTotal / totalPrem : 0;
      const prevShare = prevTotalComm > 0 ? prevComm / prevTotalComm : 0;
      const momComissaoPct = prevComm > 0 ? (comissaoTotal - prevComm) / prevComm : 0;
      const count = Number(row.contracts_count || 0);
      const blackCount = blackByRamo.get(row.key) || 0;
      const riskPct = count > 0 ? blackCount / count : 0;
      return {
        ramo: row.key,
        comissao_total: comissaoTotal,
        premio_total: premioTotal,
        margem_pct: premioTotal > 0 ? (comissaoTotal / premioTotal) * 100 : 0,
        share_comissao: shareComissao,
        share_premio: sharePremio,
        mom_comissao_pct: momComissaoPct,
        mom_share_delta: shareComissao - prevShare,
        risk_pct: Number(riskPct.toFixed(3))
      };
    })
    .sort((a, b) => b.comissao_total - a.comissao_total);

  const insurers = currentInsurers
    .map((row) => {
      const comissaoTotal = Number(row.comissao_total || 0);
      const premioTotal = Number(row.premio_total || 0);
      const prev = prevInsurerMap.get(row.key);
      const prevComm = Number(prev?.comissao_total || 0);
      const shareComissao = totalComm > 0 ? comissaoTotal / totalComm : 0;
      const prevShare = prevTotalInsComm > 0 ? prevComm / prevTotalInsComm : 0;
      const momComissaoPct = prevComm > 0 ? (comissaoTotal - prevComm) / prevComm : 0;
      return {
        seguradora: row.key,
        comissao_total: comissaoTotal,
        premio_total: premioTotal,
        margem_pct: premioTotal > 0 ? (comissaoTotal / premioTotal) * 100 : 0,
        share_comissao: shareComissao,
        mom_comissao_pct: momComissaoPct,
        mom_share_delta: shareComissao - prevShare
      };
    })
    .sort((a, b) => b.comissao_total - a.comissao_total)
    .slice(0, 8);

  return {
    products,
    insurers,
    matrix: buildMixMatrix(products)
  };
};

const buildVendorOpportunities = (renewals) => {
  const map = new Map();
  const seen = new Set();
  const candidates = [
    ...(renewals.d7 || []),
    ...(renewals.d15 || []),
    ...(renewals.d30 || [])
  ];
  for (const item of candidates) {
    if (seen.has(item.contract_id)) continue;
    seen.add(item.contract_id);
    const key = item.vendedor_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      contract_id: item.contract_id,
      segurado_nome: item.segurado_nome,
      comissao_valor: Number(item.comissao_valor || 0),
      days_to_end: item.days_to_end,
      stage: item.stage,
      impact_score: Number(item.impact_score || 0)
    });
  }
  map.forEach((items, key) => {
    items.sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0));
    map.set(key, items.slice(0, 3));
  });
  return map;
};

const getVendorAggregates = async ({ monthRef, filters = {} }) => {
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
  return result.rows
    .filter((row) => row.vendedor_id)
    .map((row) => ({
      ...row,
      comissao_total: toReaisDb(row.comissao_total || 0),
      premio_total: toReaisDb(row.premio_total || 0),
      sales_count: Number(row.sales_count || 0)
    }));
};

const getVendorAggregatesForPeriod = async ({ startMonth, endMonth, filters = {} }) => {
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
  return result.rows
    .filter((row) => row.vendedor_id)
    .map((row) => ({
      ...row,
      comissao_total: toReaisDb(row.comissao_total || 0),
      premio_total: toReaisDb(row.premio_total || 0),
      sales_count: Number(row.sales_count || 0)
    }));
};

const getVendorStats = async ({ monthRef, filters = {}, leaderboard = [], diasUteisRestantes, renewals }) => {
  const prevMonthRef = shiftMonthRef(monthRef, -1);
  const [currentRows, prevRows] = await Promise.all([
    getVendorAggregates({ monthRef, filters }),
    getVendorAggregates({ monthRef: prevMonthRef, filters })
  ]);
  const prevMap = new Map(prevRows.map((row) => [row.vendedor_id, row]));
  const xpMap = new Map(leaderboard.map((row) => [row.vendedor_id, Number(row.xp || 0)]));
  const opportunitiesMap = buildVendorOpportunities(renewals);

  return currentRows.map((row) => {
    const prev = prevMap.get(row.vendedor_id);
    const comissao = Number(row.comissao_total || 0);
    const premio = Number(row.premio_total || 0);
    const prevComm = Number(prev?.comissao_total || 0);
    const growth = prevComm > 0 ? (comissao - prevComm) / prevComm : 0;
    const gap = Math.max(0, prevComm - comissao);
    const gapDiario = diasUteisRestantes > 0 ? gap / diasUteisRestantes : 0;
    return {
      vendedor_id: row.vendedor_id,
      xp: Number(xpMap.get(row.vendedor_id) || 0),
      comissao,
      premio,
      sales_count: Number(row.sales_count || 0),
      growth_mom_pct: Number(growth.toFixed(3)),
      gap_comissao: Number(gap.toFixed(2)),
      gap_diario: Number(gapDiario.toFixed(2)),
      top_opportunities: opportunitiesMap.get(row.vendedor_id) || []
    };
  });
};

const getVendorStatsForPeriod = async ({
  startMonth,
  endMonth,
  filters = {},
  leaderboard = [],
  diasUteisRestantes,
  renewals
}) => {
  const monthsSpan = monthRefToIndex(endMonth) - monthRefToIndex(startMonth) + 1;
  const prevStart = shiftMonthRef(startMonth, -monthsSpan);
  const prevEnd = shiftMonthRef(endMonth, -monthsSpan);
  const [currentRows, prevRows] = await Promise.all([
    getVendorAggregatesForPeriod({ startMonth, endMonth, filters }),
    getVendorAggregatesForPeriod({ startMonth: prevStart, endMonth: prevEnd, filters })
  ]);
  const prevMap = new Map(prevRows.map((row) => [row.vendedor_id, row]));
  const xpMap = new Map(leaderboard.map((row) => [row.vendedor_id, Number(row.xp || 0)]));
  const opportunitiesMap = buildVendorOpportunities(renewals);

  return currentRows.map((row) => {
    const prev = prevMap.get(row.vendedor_id);
    const comissao = Number(row.comissao_total || 0);
    const premio = Number(row.premio_total || 0);
    const prevComm = Number(prev?.comissao_total || 0);
    const growth = prevComm > 0 ? (comissao - prevComm) / prevComm : 0;
    const gap = Math.max(0, prevComm - comissao);
    const gapDiario = diasUteisRestantes > 0 ? gap / diasUteisRestantes : 0;
    return {
      vendedor_id: row.vendedor_id,
      xp: Number(xpMap.get(row.vendedor_id) || 0),
      comissao,
      premio,
      sales_count: Number(row.sales_count || 0),
      growth_mom_pct: Number(growth.toFixed(3)),
      gap_comissao: Number(gap.toFixed(2)),
      gap_diario: Number(gapDiario.toFixed(2)),
      top_opportunities: opportunitiesMap.get(row.vendedor_id) || []
    };
  });
};

export const buildMonthlySnapshot = async ({
  monthRef,
  scenarioId = null,
  force = false,
  rulesVersionId = null,
  rulesOverride = null,
  filters = {},
  persist = true
}) => {
  const startedAt = Date.now();
  logInfo('snapshot', 'Montando snapshot mensal', {
    month_ref: monthRef,
    scenario_id: scenarioId,
    force,
    rules_version_id: rulesOverride?.rules_version_id || rulesVersionId || 'auto',
    filters
  });

  const monthStart = startOfMonth(monthRef);
  const overrideRules =
    rulesOverride || (rulesVersionId ? await getRulesVersionById(rulesVersionId) : null);
  if (rulesVersionId && !overrideRules) {
    throw new Error('rules_version_id inválido');
  }
  const rules = overrideRules || (await getRulesVersionForDate(monthStart));

  const rulesVersionToUse = overrideRules ? overrideRules.rules_version_id : null;
  await computeLedgerForMonth({
    monthRef,
    scenarioId,
    force,
    rulesVersionId: rulesVersionToUse,
    rulesOverride: overrideRules
  });

  logInfo('snapshot', 'Regras aplicadas', {
    rules_version_id: rules.rules_version_id,
    meta_comissao: Number(rules.meta_global_comissao),
    dias_uteis: Number(rules.dias_uteis)
  });

  const today = new Date();
  const monthEnd = endOfMonth(monthRef);
  const referenceDate = today <= monthEnd ? today : monthEnd;
  const dayOfMonth = referenceDate.getUTCDate();
  const cutoffDate = formatDate(referenceDate);
  const prevMonthRef = shiftMonthRef(monthRef, -1);
  const prevMonthEnd = endOfMonth(prevMonthRef);
  const prevCutoff = new Date(
    Date.UTC(prevMonthEnd.getUTCFullYear(), prevMonthEnd.getUTCMonth(), Math.min(dayOfMonth, prevMonthEnd.getUTCDate()))
  );
  const yoyMonthRef = shiftMonthRef(monthRef, -12);
  const yoyMonthEnd = endOfMonth(yoyMonthRef);
  const yoyCutoff = new Date(
    Date.UTC(yoyMonthEnd.getUTCFullYear(), yoyMonthEnd.getUTCMonth(), Math.min(dayOfMonth, yoyMonthEnd.getUTCDate()))
  );

  const contracts = await fetchContractsForMonth(monthRef, true, filters);
  const [currentAgg, prevAgg, yoyAgg, renewals, dataCoverage, filterOptions, trendDaily] = await Promise.all([
    getMonthlyAggregates({ monthRef, filters, cutoffDate }),
    getMonthlyAggregates({ monthRef: prevMonthRef, filters, cutoffDate: formatDate(prevCutoff) }),
    getMonthlyAggregates({ monthRef: yoyMonthRef, filters, cutoffDate: formatDate(yoyCutoff) }),
    getRenewalMetrics({ referenceDate, vendorId: filters.vendorId, ramo: filters.ramo }),
    getDataCoverage(monthRef),
    getFilterOptions(monthRef),
    getDailyTrend({ monthRef, filters, referenceDate, days: 14 })
  ]);

  const comissaoMtd = currentAgg.comissaoTotal;
  const premioMtd = currentAgg.premioTotal;
  const margemMedia = currentAgg.margemPct;
  const ticketMedio = currentAgg.ticketMedio;

  if (contracts.length === 0) {
    logWarn('snapshot', 'Nenhum contrato encontrado para o mes', { month_ref: monthRef });
  } else {
    logInfo('snapshot', 'Contratos carregados', {
      count: contracts.length,
      comissao_mtd: Number(comissaoMtd.toFixed(2))
    });
  }
  if (comissaoMtd === 0) {
    logWarn('snapshot', 'Comissao MTD zerada. Verifique ingestao ou mes selecionado', {
      month_ref: monthRef
    });
  }
  const curveShare = await getCurveShare(dayOfMonth, config.ingest.defaultCurveId);
  const shareEsperado = curveShare || dayOfMonth / monthEnd.getUTCDate();
  if (!curveShare) {
    logWarn('snapshot', 'Curva historica indisponivel, usando fallback linear', {
      month_ref: monthRef,
      day: dayOfMonth
    });
    await query(
      `INSERT INTO audit_logs (event_type, payload)
       VALUES ($1, $2::jsonb)`,
      ['CURVE_FALLBACK', JSON.stringify({ month_ref: monthRef, day: dayOfMonth })]
    );
  }
  const forecastComissao = shareEsperado > 0 ? comissaoMtd / shareEsperado : 0;

  const businessDaysElapsed = countBusinessDays(monthStart, referenceDate);
  const diasUteisRestantes = Math.max(0, rules.dias_uteis - businessDaysElapsed);
  const gap = Math.max(0, rules.meta_global_comissao - comissaoMtd);
  const gapDiario = diasUteisRestantes > 0 ? gap / diasUteisRestantes : 0;

  const autoComm = contracts
    .filter((c) => c.ramo === 'AUTO')
    .reduce((sum, c) => sum + toReaisDb(c.comissao_valor), 0);
  const autoShare = comissaoMtd > 0 ? autoComm / comissaoMtd : 0;
  const monoprodutoPct = await getCustomersMonoprodutoPct(filters.vendorId || null);

  const momComissaoPct = prevAgg.comissaoTotal > 0 ? (comissaoMtd - prevAgg.comissaoTotal) / prevAgg.comissaoTotal : 0;
  const yoyComissaoPct = yoyAgg.comissaoTotal > 0 ? (comissaoMtd - yoyAgg.comissaoTotal) / yoyAgg.comissaoTotal : 0;
  const momPremioPct = prevAgg.premioTotal > 0 ? (premioMtd - prevAgg.premioTotal) / prevAgg.premioTotal : 0;
  const yoyPremioPct = yoyAgg.premioTotal > 0 ? (premioMtd - yoyAgg.premioTotal) / yoyAgg.premioTotal : 0;
  const momMargemPct = prevAgg.margemPct > 0 ? (margemMedia - prevAgg.margemPct) / prevAgg.margemPct : 0;
  const yoyMargemPct = yoyAgg.margemPct > 0 ? (margemMedia - yoyAgg.margemPct) / yoyAgg.margemPct : 0;
  const momTicketPct = prevAgg.ticketMedio > 0 ? (ticketMedio - prevAgg.ticketMedio) / prevAgg.ticketMedio : 0;
  const yoyTicketPct = yoyAgg.ticketMedio > 0 ? (ticketMedio - yoyAgg.ticketMedio) / yoyAgg.ticketMedio : 0;
  const blackByRamo = new Map();
  renewals.black.forEach((contract) => {
    blackByRamo.set(contract.ramo, (blackByRamo.get(contract.ramo) || 0) + 1);
  });
  logInfo('snapshot', 'Semaforo de renovacao calculado', {
    d7: renewals.d7.length,
    d15: renewals.d15.length,
    d30: renewals.d30.length,
    black: renewals.blackListCount
  });

  const leaderboard = await getLeaderboard(monthRef, scenarioId, filters);
  const radar = getRadarData(contracts, blackByRamo);
  const mix = await getMixData({ monthRef, filters, blackByRamo });
  const vendorStats = await getVendorStats({
    monthRef,
    filters,
    leaderboard,
    diasUteisRestantes,
    renewals
  });
  const status = await getLatestIngestionStatus();
  logInfo('snapshot', 'Status de ingestao', {
    status: status.status,
    finished_at: status.finishedAt
  });

  const snapshot = {
    month: monthRef,
    snapshot_version: SNAPSHOT_VERSION,
    money_unit: SNAPSHOT_MONEY_UNIT,
    processing: {
      duration_ms: Date.now() - startedAt,
      generated_at: new Date().toISOString()
    },
    data_coverage: dataCoverage,
    filters: filterOptions,
    kpis: {
      meta_comissao: Number(rules.meta_global_comissao),
      comissao_mtd: comissaoMtd,
      premio_mtd: premioMtd,
      ticket_medio: ticketMedio,
      margem_media_pct: margemMedia,
      pct_meta: rules.meta_global_comissao > 0 ? comissaoMtd / rules.meta_global_comissao : 0,
      forecast_comissao: forecastComissao,
      forecast_pct_meta:
        rules.meta_global_comissao > 0 ? forecastComissao / rules.meta_global_comissao : 0,
      gap_diario: gapDiario,
      auto_share_comissao: autoShare,
      monoproduto_pct: monoprodutoPct,
      mom_comissao_pct: Number(momComissaoPct.toFixed(3)),
      yoy_comissao_pct: Number(yoyComissaoPct.toFixed(3)),
      mom_premio_pct: Number(momPremioPct.toFixed(3)),
      yoy_premio_pct: Number(yoyPremioPct.toFixed(3)),
      mom_margem_pct: Number(momMargemPct.toFixed(3)),
      yoy_margem_pct: Number(yoyMargemPct.toFixed(3)),
      mom_ticket_pct: Number(momTicketPct.toFixed(3)),
      yoy_ticket_pct: Number(yoyTicketPct.toFixed(3))
    },
    trend_daily: trendDaily,
    renewals: {
      d7: { count: renewals.d7.length, comissao_risco: renewals.d7Risk },
      d15: { count: renewals.d15.length, comissao_risco: renewals.d15Risk },
      d30: { count: renewals.d30.length, comissao_risco: renewals.d30Risk }
    },
    leaderboard,
    vendor_stats: vendorStats,
    radar: {
      bubble_products: radar.bubbleProducts,
      top_insurer_share: radar.topInsurerShare
    },
    mix
  };

  const staleData = status.status === 'STALE_DATA';
  if (persist) {
    await query(
      `INSERT INTO snapshots_month (month_ref, scenario_id, rules_version_id, data, is_scenario, stale_data)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [monthRef, scenarioId, rules.rules_version_id, JSON.stringify(snapshot), Boolean(scenarioId), staleData]
    );
  }

  logSuccess('snapshot', 'Snapshot pronto', {
    month_ref: monthRef,
    leaderboard: leaderboard.length,
    radar_products: radar.bubbleProducts.length,
    stale_data: staleData,
    duration_ms: Date.now() - startedAt
  });

  return snapshot;
};

export const buildPeriodSnapshot = async ({
  startMonth,
  endMonth,
  filters = {}
}) => {
  const startedAt = Date.now();
  const normalized = normalizeMonthRange(startMonth, endMonth);
  const rangeStart = normalized.startMonth;
  const rangeEnd = normalized.endMonth;
  const months = listMonthRefs(rangeStart, rangeEnd);

  logInfo('snapshot', 'Montando snapshot de periodo', {
    start_month: rangeStart,
    end_month: rangeEnd,
    months: months.length,
    filters
  });

  const rangeEndDate = endOfMonth(rangeEnd);
  const today = new Date();
  const referenceDate = today <= rangeEndDate ? today : rangeEndDate;
  const referenceMonthRef = formatMonthRef(referenceDate);
  const cutoffDate = formatDate(referenceDate);

  const monthsSpan = months.length;
  const prevStart = shiftMonthRef(rangeStart, -monthsSpan);
  const prevEnd = shiftMonthRef(rangeEnd, -monthsSpan);
  const prevReferenceDate = shiftDateByMonths(referenceDate, -monthsSpan);
  const prevCutoff = formatDate(prevReferenceDate);

  const yoyStart = shiftMonthRef(rangeStart, -12);
  const yoyEnd = shiftMonthRef(rangeEnd, -12);
  const yoyReferenceDate = shiftDateByMonths(referenceDate, -12);
  const yoyCutoff = formatDate(yoyReferenceDate);

  const [currentAgg, prevAgg, yoyAgg, renewals, dataCoverage, filterOptions, trendDaily] = await Promise.all([
    getPeriodAggregates({ startMonth: rangeStart, endMonth: rangeEnd, filters, cutoffDate }),
    getPeriodAggregates({ startMonth: prevStart, endMonth: prevEnd, filters, cutoffDate: prevCutoff }),
    getPeriodAggregates({ startMonth: yoyStart, endMonth: yoyEnd, filters, cutoffDate: yoyCutoff }),
    getRenewalMetrics({ referenceDate, vendorId: filters.vendorId, ramo: filters.ramo }),
    getDataCoverageForPeriod(rangeStart, rangeEnd),
    getFilterOptionsForPeriod(rangeStart, rangeEnd),
    getDailyTrendForPeriod({ startMonth: rangeStart, endMonth: rangeEnd, filters, referenceDate, days: 14 })
  ]);

  const endMonthAgg = await getMonthlyAggregates({
    monthRef: rangeEnd,
    filters,
    cutoffDate: referenceMonthRef === rangeEnd ? cutoffDate : formatDate(rangeEndDate)
  });

  const rulesCache = new Map();
  const resolveRulesForMonth = async (monthRef) => {
    if (rulesCache.has(monthRef)) return rulesCache.get(monthRef);
    const rules = await getRulesVersionForDate(startOfMonth(monthRef));
    rulesCache.set(monthRef, rules);
    return rules;
  };
  const rulesList = await Promise.all(months.map(resolveRulesForMonth));
  const metaTotal = rulesList.reduce(
    (sum, rules) => sum + Number(rules.meta_global_comissao || 0),
    0
  );
  const endMonthRules = await resolveRulesForMonth(rangeEnd);

  const comissaoTotal = currentAgg.comissaoTotal;
  const premioTotal = currentAgg.premioTotal;
  const margemMedia = currentAgg.margemPct;
  const ticketMedio = currentAgg.ticketMedio;

  const dayOfMonth = referenceDate.getUTCDate();
  const curveShare = referenceMonthRef === rangeEnd
    ? await getCurveShare(dayOfMonth, config.ingest.defaultCurveId)
    : null;
  const shareEsperado = curveShare || (referenceMonthRef === rangeEnd ? dayOfMonth / rangeEndDate.getUTCDate() : 1);
  const prevMonthsComissao = comissaoTotal - endMonthAgg.comissaoTotal;
  const endMonthForecast =
    referenceMonthRef === rangeEnd && shareEsperado > 0
      ? endMonthAgg.comissaoTotal / shareEsperado
      : endMonthAgg.comissaoTotal;
  const forecastComissao =
    referenceMonthRef === rangeEnd ? prevMonthsComissao + endMonthForecast : comissaoTotal;

  const endMonthStart = startOfMonth(rangeEnd);
  const businessDaysElapsed = countBusinessDays(endMonthStart, referenceDate);
  const diasUteisRestantes = Math.max(0, Number(endMonthRules.dias_uteis) - businessDaysElapsed);
  const gap = Math.max(0, Number(endMonthRules.meta_global_comissao || 0) - endMonthAgg.comissaoTotal);
  const gapDiario = diasUteisRestantes > 0 ? gap / diasUteisRestantes : 0;

  const momComissaoPct = prevAgg.comissaoTotal > 0 ? (comissaoTotal - prevAgg.comissaoTotal) / prevAgg.comissaoTotal : 0;
  const yoyComissaoPct = yoyAgg.comissaoTotal > 0 ? (comissaoTotal - yoyAgg.comissaoTotal) / yoyAgg.comissaoTotal : 0;
  const momPremioPct = prevAgg.premioTotal > 0 ? (premioTotal - prevAgg.premioTotal) / prevAgg.premioTotal : 0;
  const yoyPremioPct = yoyAgg.premioTotal > 0 ? (premioTotal - yoyAgg.premioTotal) / yoyAgg.premioTotal : 0;
  const momMargemPct = prevAgg.margemPct > 0 ? (margemMedia - prevAgg.margemPct) / prevAgg.margemPct : 0;
  const yoyMargemPct = yoyAgg.margemPct > 0 ? (margemMedia - yoyAgg.margemPct) / yoyAgg.margemPct : 0;
  const momTicketPct = prevAgg.ticketMedio > 0 ? (ticketMedio - prevAgg.ticketMedio) / prevAgg.ticketMedio : 0;
  const yoyTicketPct = yoyAgg.ticketMedio > 0 ? (ticketMedio - yoyAgg.ticketMedio) / yoyAgg.ticketMedio : 0;

  const blackByRamo = new Map();
  renewals.black.forEach((contract) => {
    blackByRamo.set(contract.ramo, (blackByRamo.get(contract.ramo) || 0) + 1);
  });

  const leaderboard = await getLeaderboardForPeriod(rangeStart, rangeEnd, filters);
  const radar = await getRadarDataForPeriod({ startMonth: rangeStart, endMonth: rangeEnd, filters, blackByRamo });
  const mix = await getMixDataForPeriod({ startMonth: rangeStart, endMonth: rangeEnd, filters, blackByRamo });
  const vendorStats = await getVendorStatsForPeriod({
    startMonth: rangeStart,
    endMonth: rangeEnd,
    filters,
    leaderboard,
    diasUteisRestantes,
    renewals
  });

  const autoItem = mix.products.find((item) => item.ramo === 'AUTO');
  const autoShare = autoItem ? autoItem.share_comissao : 0;
  const monoprodutoPct = await getCustomersMonoprodutoPct(filters.vendorId || null);

  const snapshot = {
    month: rangeEnd,
    snapshot_version: SNAPSHOT_VERSION,
    money_unit: SNAPSHOT_MONEY_UNIT,
    processing: {
      duration_ms: Date.now() - startedAt,
      generated_at: new Date().toISOString()
    },
    period: {
      start: rangeStart,
      end: rangeEnd,
      months: months.length,
      label: rangeStart === rangeEnd ? rangeStart : `${rangeStart}..${rangeEnd}`
    },
    data_coverage: dataCoverage,
    filters: filterOptions,
    kpis: {
      meta_comissao: Number(metaTotal),
      comissao_mtd: comissaoTotal,
      premio_mtd: premioTotal,
      ticket_medio: ticketMedio,
      margem_media_pct: margemMedia,
      pct_meta: metaTotal > 0 ? comissaoTotal / metaTotal : 0,
      forecast_comissao: forecastComissao,
      forecast_pct_meta: metaTotal > 0 ? forecastComissao / metaTotal : 0,
      gap_diario: gapDiario,
      auto_share_comissao: autoShare,
      monoproduto_pct: monoprodutoPct,
      mom_comissao_pct: Number(momComissaoPct.toFixed(3)),
      yoy_comissao_pct: Number(yoyComissaoPct.toFixed(3)),
      mom_premio_pct: Number(momPremioPct.toFixed(3)),
      yoy_premio_pct: Number(yoyPremioPct.toFixed(3)),
      mom_margem_pct: Number(momMargemPct.toFixed(3)),
      yoy_margem_pct: Number(yoyMargemPct.toFixed(3)),
      mom_ticket_pct: Number(momTicketPct.toFixed(3)),
      yoy_ticket_pct: Number(yoyTicketPct.toFixed(3))
    },
    trend_daily: trendDaily,
    renewals: {
      d7: { count: renewals.d7.length, comissao_risco: renewals.d7Risk },
      d15: { count: renewals.d15.length, comissao_risco: renewals.d15Risk },
      d30: { count: renewals.d30.length, comissao_risco: renewals.d30Risk }
    },
    leaderboard,
    vendor_stats: vendorStats,
    radar: {
      bubble_products: radar.bubbleProducts,
      top_insurer_share: radar.topInsurerShare
    },
    mix
  };

  logSuccess('snapshot', 'Snapshot de periodo pronto', {
    start_month: rangeStart,
    end_month: rangeEnd,
    duration_ms: Date.now() - startedAt
  });

  return snapshot;
};

export const getSnapshotCached = async ({ monthRef, scenarioId = null, rulesVersionId = null }) => {
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

export const getLatestSnapshotRulesVersionId = async (monthRef) => {
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

export const listScenarioSnapshots = async ({ monthRef }) => {
  const result = await query(
    `SELECT scenario_id, rules_version_id, created_at, data
     FROM snapshots_month
     WHERE month_ref = $1 AND is_scenario = TRUE
     ORDER BY created_at DESC
     LIMIT 10`,
    [monthRef]
  );
  return result.rows
    .map((row) => ({
      ...row.data,
      scenario_id: row.scenario_id,
      rules_version_id: row.rules_version_id,
      created_at: row.created_at
    }))
    .filter((snapshot) => isSnapshotVersionCompatible(snapshot));
};

export const compareSnapshots = async ({ monthRef, scenarioId }) => {
  const base = await getSnapshotCached({ monthRef, scenarioId: null });
  const scenario = await getSnapshotCached({ monthRef, scenarioId });
  if (!base || !scenario) return null;
  if (!isSnapshotVersionCompatible(base) || !isSnapshotVersionCompatible(scenario)) return null;

  const deltaFields = [
    'comissao_mtd',
    'premio_mtd',
    'forecast_comissao',
    'gap_diario',
    'auto_share_comissao',
    'margem_media_pct',
    'ticket_medio',
    'pct_meta'
  ];
  const kpisDelta = {};
  deltaFields.forEach((field) => {
    kpisDelta[field] = Number(scenario.kpis?.[field] || 0) - Number(base.kpis?.[field] || 0);
  });

  const baseRanks = new Map(
    (base.leaderboard || []).map((row, idx) => [row.vendedor_id, idx + 1])
  );
  const scenarioRanks = new Map(
    (scenario.leaderboard || []).map((row, idx) => [row.vendedor_id, idx + 1])
  );
  const vendors = new Set([...baseRanks.keys(), ...scenarioRanks.keys()]);
  const ranking = Array.from(vendors)
    .map((vendorId) => {
      const baseRank = baseRanks.get(vendorId) || null;
      const scenarioRank = scenarioRanks.get(vendorId) || null;
      const rankDelta =
        baseRank && scenarioRank ? baseRank - scenarioRank : baseRank ? -baseRank : scenarioRank ? scenarioRank : null;
      return {
        vendedor_id: vendorId,
        base_rank: baseRank,
        scenario_rank: scenarioRank,
        rank_delta: rankDelta
      };
    })
    .sort((a, b) => Math.abs(b.rank_delta || 0) - Math.abs(a.rank_delta || 0))
    .slice(0, 8);

  const baseMixMap = new Map((base.mix?.products || []).map((row) => [row.ramo, row.share_comissao]));
  const scenarioMixMap = new Map((scenario.mix?.products || []).map((row) => [row.ramo, row.share_comissao]));
  const mixKeys = new Set([...baseMixMap.keys(), ...scenarioMixMap.keys()]);
  const mix = Array.from(mixKeys).map((ramo) => ({
    ramo,
    share_delta: Number(scenarioMixMap.get(ramo) || 0) - Number(baseMixMap.get(ramo) || 0)
  }));

  return {
    base,
    scenario,
    delta: {
      kpis: kpisDelta,
      ranking,
      mix
    }
  };
};
