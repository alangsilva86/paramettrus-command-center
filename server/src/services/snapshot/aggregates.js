import { addDays, endOfMonth, formatDate, startOfMonth } from '../../utils/date.js';
import { toReaisDb } from './constants.js';
import { toNumber } from './numbers.js';
import {
  fetchCustomersMonoprodutoTotals,
  fetchCustomersMonoprodutoTotalsForCpfs,
  fetchDailyTrendRowsForMonth,
  fetchDailyTrendRowsForPeriod,
  fetchDataCoverageCountsForMonth,
  fetchDataCoverageCountsForPeriod,
  fetchDataSources,
  fetchFilterOptionsForMonth,
  fetchFilterOptionsForPeriod,
  fetchLatestIngestionStatus,
  fetchMonthlyAggregates,
  fetchPeriodAggregates,
  fetchVendorCpfs
} from './repository.js';

const buildAggregateResult = (row) => {
  const count = toNumber(row.count);
  const comissaoTotal = toReaisDb(row.comissao_total || 0);
  const premioTotal = toReaisDb(row.premio_total || 0);
  const margemPct = premioTotal > 0 ? (comissaoTotal / premioTotal) * 100 : 0;
  const ticketMedio = count > 0 ? premioTotal / count : 0;
  return { count, comissaoTotal, premioTotal, margemPct, ticketMedio };
};

const buildDailyTrendSeries = ({ rows, start, days }) => {
  const map = new Map(
    rows.map((row) => [
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

const buildCoverage = ({ counts, sources, status }) => {
  const total = toNumber(counts.total);
  const invalid = toNumber(counts.invalid);
  const incomplete = toNumber(counts.incomplete);
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
    sources: sources.map((row) => ({
      source: row.source,
      count: toNumber(row.count)
    })),
    last_ingestion_at: status.finishedAt,
    ingestion_status: status.status,
    confidence
  };
};

const resolveIngestionStatus = (getIngestionStatus) => {
  if (getIngestionStatus) return getIngestionStatus();
  return fetchLatestIngestionStatus();
};

const getDataCoverageBase = async ({ counts, startDate, endDate, getIngestionStatus }) => {
  const [sources, status] = await Promise.all([
    fetchDataSources({ startDate, endDate }),
    resolveIngestionStatus(getIngestionStatus)
  ]);

  return buildCoverage({ counts, sources, status });
};

const getFilterOptionsBase = (fetcher, ...args) => fetcher(...args);

export const getMonthlyAggregates = async ({ monthRef, filters = {}, cutoffDate = null } = {}) => {
  const row = await fetchMonthlyAggregates({ monthRef, filters, cutoffDate });
  return buildAggregateResult(row);
};

export const getPeriodAggregates = async ({ startMonth, endMonth, filters = {}, cutoffDate = null } = {}) => {
  const row = await fetchPeriodAggregates({ startMonth, endMonth, filters, cutoffDate });
  return buildAggregateResult(row);
};

export const getDailyTrend = async ({ monthRef, filters = {}, referenceDate, days = 14 }) => {
  const start = addDays(referenceDate, -(days - 1));
  const startKey = formatDate(start);
  const endKey = formatDate(referenceDate);
  const rows = await fetchDailyTrendRowsForMonth({ monthRef, filters, startKey, endKey });

  return buildDailyTrendSeries({ rows, start, days });
};

export const getDailyTrendForPeriod = async ({
  startMonth,
  endMonth,
  filters = {},
  referenceDate,
  days = 14
}) => {
  const start = addDays(referenceDate, -(days - 1));
  const startKey = formatDate(start);
  const endKey = formatDate(referenceDate);
  const rows = await fetchDailyTrendRowsForPeriod({
    startMonth,
    endMonth,
    filters,
    startKey,
    endKey
  });

  return buildDailyTrendSeries({ rows, start, days });
};

export const getDataCoverage = async (monthRef, { getIngestionStatus } = {}) => {
  const counts = await fetchDataCoverageCountsForMonth(monthRef);
  const monthStart = startOfMonth(monthRef);
  const monthEnd = endOfMonth(monthRef);
  return getDataCoverageBase({
    counts,
    startDate: monthStart,
    endDate: addDays(monthEnd, 1),
    getIngestionStatus
  });
};

export const getDataCoverageForPeriod = async (startMonth, endMonth, { getIngestionStatus } = {}) => {
  const counts = await fetchDataCoverageCountsForPeriod(startMonth, endMonth);
  const rangeStart = startOfMonth(startMonth);
  const rangeEnd = endOfMonth(endMonth);
  return getDataCoverageBase({
    counts,
    startDate: rangeStart,
    endDate: addDays(rangeEnd, 1),
    getIngestionStatus
  });
};

export const getFilterOptions = async (monthRef) => {
  return getFilterOptionsBase(fetchFilterOptionsForMonth, monthRef);
};

export const getFilterOptionsForPeriod = async (startMonth, endMonth) => {
  return getFilterOptionsBase(fetchFilterOptionsForPeriod, startMonth, endMonth);
};

export const getCustomersMonoprodutoPct = async (vendorId = null) => {
  if (!vendorId) {
    const result = await fetchCustomersMonoprodutoTotals();
    const total = toNumber(result.total);
    const mono = toNumber(result.mono);
    return total > 0 ? mono / total : 0;
  }

  const cpfList = await fetchVendorCpfs(vendorId);
  if (!cpfList.length) return 0;
  const result = await fetchCustomersMonoprodutoTotalsForCpfs(cpfList);
  const total = toNumber(result.total);
  const mono = toNumber(result.mono);
  return total > 0 ? mono / total : 0;
};
