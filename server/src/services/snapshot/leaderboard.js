import { toReaisDb } from './constants.js';
import { fetchLeaderboardRows, fetchLeaderboardRowsForPeriod } from './repository.js';

export const getLeaderboard = async (monthRef, scenarioId, filters = {}) => {
  const rows = await fetchLeaderboardRows({ monthRef, scenarioId, filters });
  const vendorMap = new Map();

  rows.forEach((entry) => {
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

export const getLeaderboardForPeriod = async (startMonth, endMonth, filters = {}) => {
  const rows = await fetchLeaderboardRowsForPeriod({ startMonth, endMonth, filters });
  const vendorMap = new Map();

  rows.forEach((entry) => {
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
