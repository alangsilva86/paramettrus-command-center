import { toReaisDb } from './constants.js';
import { fetchVendorAggregates, fetchVendorAggregatesForPeriod } from './repository.js';
import { monthRefToIndex, shiftMonthRef } from './utils.js';

const normalizeVendorAggregates = (rows) =>
  rows
    .filter((row) => row.vendedor_id)
    .map((row) => ({
      ...row,
      comissao_total: toReaisDb(row.comissao_total || 0),
      premio_total: toReaisDb(row.premio_total || 0),
      sales_count: Number(row.sales_count || 0)
    }));

export const getVendorAggregates = async ({ monthRef, filters = {} }) => {
  const rows = await fetchVendorAggregates({ monthRef, filters });
  return normalizeVendorAggregates(rows);
};

export const getVendorAggregatesForPeriod = async ({ startMonth, endMonth, filters = {} }) => {
  const rows = await fetchVendorAggregatesForPeriod({ startMonth, endMonth, filters });
  return normalizeVendorAggregates(rows);
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

export const getVendorStats = async ({ monthRef, filters = {}, leaderboard = [], diasUteisRestantes, renewals }) => {
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
