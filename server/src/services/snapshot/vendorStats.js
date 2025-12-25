import { toReaisDb } from './constants.js';
import { toNumber } from './numbers.js';
import { fetchVendorAggregates, fetchVendorAggregatesForPeriod } from './repository.js';
import { monthRefToIndex, shiftMonthRef } from './utils.js';

const normalizeVendorAggregates = (rows) =>
  rows
    .filter((row) => row.vendedor_id)
    .map((row) => ({
      ...row,
      comissao_total: toReaisDb(row.comissao_total || 0),
      premio_total: toReaisDb(row.premio_total || 0),
      sales_count: toNumber(row.sales_count)
    }));

const getVendorAggregatesBase = async (fetcher, params) => {
  const rows = await fetcher(params);
  return normalizeVendorAggregates(rows);
};

export const getVendorAggregates = async ({ monthRef, filters = {} }) =>
  getVendorAggregatesBase(fetchVendorAggregates, { monthRef, filters });

export const getVendorAggregatesForPeriod = async ({ startMonth, endMonth, filters = {} }) =>
  getVendorAggregatesBase(fetchVendorAggregatesForPeriod, { startMonth, endMonth, filters });

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
      comissao_valor: toNumber(item.comissao_valor),
      days_to_end: item.days_to_end,
      stage: item.stage,
      impact_score: toNumber(item.impact_score)
    });
  }
  map.forEach((items, key) => {
    items.sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0));
    map.set(key, items.slice(0, 3));
  });
  return map;
};

export const getVendorStats = async ({ monthRef, filters = {}, leaderboard = [], diasUteisRestantes, renewals }) => {
  const prevMonthRef = shiftMonthRef(monthRef, -1);
  const [currentRows, prevRows] = await Promise.all([
    getVendorAggregates({ monthRef, filters }),
    getVendorAggregates({ monthRef: prevMonthRef, filters })
  ]);
  const prevMap = new Map(prevRows.map((row) => [row.vendedor_id, row]));
  const xpMap = new Map(leaderboard.map((row) => [row.vendedor_id, toNumber(row.xp)]));
  const opportunitiesMap = buildVendorOpportunities(renewals);

  return currentRows.map((row) => {
    const prev = prevMap.get(row.vendedor_id);
    const comissao = toNumber(row.comissao_total);
    const premio = toNumber(row.premio_total);
    const prevComm = toNumber(prev?.comissao_total);
    const growth = prevComm > 0 ? (comissao - prevComm) / prevComm : 0;
    const gap = Math.max(0, prevComm - comissao);
    const gapDiario = diasUteisRestantes > 0 ? gap / diasUteisRestantes : 0;
    return {
      vendedor_id: row.vendedor_id,
      xp: toNumber(xpMap.get(row.vendedor_id)),
      comissao,
      premio,
      sales_count: toNumber(row.sales_count),
      growth_mom_pct: Number(growth.toFixed(3)),
      gap_comissao: Number(gap.toFixed(2)),
      gap_diario: Number(gapDiario.toFixed(2)),
      top_opportunities: opportunitiesMap.get(row.vendedor_id) || []
    };
  });
};

export const getVendorStatsForPeriod = async ({
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
  const xpMap = new Map(leaderboard.map((row) => [row.vendedor_id, toNumber(row.xp)]));
  const opportunitiesMap = buildVendorOpportunities(renewals);

  return currentRows.map((row) => {
    const prev = prevMap.get(row.vendedor_id);
    const comissao = toNumber(row.comissao_total);
    const premio = toNumber(row.premio_total);
    const prevComm = toNumber(prev?.comissao_total);
    const growth = prevComm > 0 ? (comissao - prevComm) / prevComm : 0;
    const gap = Math.max(0, prevComm - comissao);
    const gapDiario = diasUteisRestantes > 0 ? gap / diasUteisRestantes : 0;
    return {
      vendedor_id: row.vendedor_id,
      xp: toNumber(xpMap.get(row.vendedor_id)),
      comissao,
      premio,
      sales_count: toNumber(row.sales_count),
      growth_mom_pct: Number(growth.toFixed(3)),
      gap_comissao: Number(gap.toFixed(2)),
      gap_diario: Number(gapDiario.toFixed(2)),
      top_opportunities: opportunitiesMap.get(row.vendedor_id) || []
    };
  });
};
