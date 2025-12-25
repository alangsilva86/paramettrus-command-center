import { addDays, endOfMonth, formatDate, startOfMonth } from '../../utils/date.js';
import { toReaisDb } from './constants.js';
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

export const getMonthlyAggregates = async ({ monthRef, filters = {}, cutoffDate = null } = {}) => {
  const row = await fetchMonthlyAggregates({ monthRef, filters, cutoffDate });
  const count = Number(row.count || 0);
  const comissaoTotal = toReaisDb(row.comissao_total || 0);
  const premioTotal = toReaisDb(row.premio_total || 0);
  const margemPct = premioTotal > 0 ? (comissaoTotal / premioTotal) * 100 : 0;
  const ticketMedio = count > 0 ? premioTotal / count : 0;
  return { count, comissaoTotal, premioTotal, margemPct, ticketMedio };
};

export const getPeriodAggregates = async ({ startMonth, endMonth, filters = {}, cutoffDate = null } = {}) => {
  const row = await fetchPeriodAggregates({ startMonth, endMonth, filters, cutoffDate });
  const count = Number(row.count || 0);
  const comissaoTotal = toReaisDb(row.comissao_total || 0);
  const premioTotal = toReaisDb(row.premio_total || 0);
  const margemPct = premioTotal > 0 ? (comissaoTotal / premioTotal) * 100 : 0;
  const ticketMedio = count > 0 ? premioTotal / count : 0;
  return { count, comissaoTotal, premioTotal, margemPct, ticketMedio };
};

export const getDailyTrend = async ({ monthRef, filters = {}, referenceDate, days = 14 }) => {
  const start = addDays(referenceDate, -(days - 1));
  const startKey = formatDate(start);
  const endKey = formatDate(referenceDate);
  const rows = await fetchDailyTrendRowsForMonth({ monthRef, filters, startKey, endKey });

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

export const getDataCoverage = async (monthRef) => {
  const counts = await fetchDataCoverageCountsForMonth(monthRef);
  const monthStart = startOfMonth(monthRef);
  const monthEnd = endOfMonth(monthRef);
  const sources = await fetchDataSources({
    startDate: monthStart,
    endDate: addDays(monthEnd, 1)
  });
  const status = await fetchLatestIngestionStatus();
  const total = Number(counts.total || 0);
  const invalid = Number(counts.invalid || 0);
  const incomplete = Number(counts.incomplete || 0);
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
      count: Number(row.count || 0)
    })),
    last_ingestion_at: status.finishedAt,
    ingestion_status: status.status,
    confidence
  };
};

export const getDataCoverageForPeriod = async (startMonth, endMonth) => {
  const counts = await fetchDataCoverageCountsForPeriod(startMonth, endMonth);
  const rangeStart = startOfMonth(startMonth);
  const rangeEnd = endOfMonth(endMonth);
  const sources = await fetchDataSources({
    startDate: rangeStart,
    endDate: addDays(rangeEnd, 1)
  });
  const status = await fetchLatestIngestionStatus();
  const total = Number(counts.total || 0);
  const invalid = Number(counts.invalid || 0);
  const incomplete = Number(counts.incomplete || 0);
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
      count: Number(row.count || 0)
    })),
    last_ingestion_at: status.finishedAt,
    ingestion_status: status.status,
    confidence
  };
};

export const getFilterOptions = async (monthRef) => {
  return fetchFilterOptionsForMonth(monthRef);
};

export const getFilterOptionsForPeriod = async (startMonth, endMonth) => {
  return fetchFilterOptionsForPeriod(startMonth, endMonth);
};

export const getCustomersMonoprodutoPct = async (vendorId = null) => {
  if (!vendorId) {
    const result = await fetchCustomersMonoprodutoTotals();
    const { total, mono } = result;
    return total > 0 ? mono / total : 0;
  }

  const cpfList = await fetchVendorCpfs(vendorId);
  if (!cpfList.length) return 0;
  const result = await fetchCustomersMonoprodutoTotalsForCpfs(cpfList);
  const { total, mono } = result;
  return total > 0 ? mono / total : 0;
};
