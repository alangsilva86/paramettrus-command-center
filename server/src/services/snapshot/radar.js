import { toReaisDb } from './constants.js';
import { fetchRadarInsurerStatsForPeriod, fetchRadarRamoStatsForPeriod } from './repository.js';

export const getRadarData = (contractsRows, blackByRamo) => {
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

export const getRadarDataForPeriod = async ({ startMonth, endMonth, filters = {}, blackByRamo }) => {
  const ramoRows = await fetchRadarRamoStatsForPeriod({ startMonth, endMonth, filters });
  const insurerRows = await fetchRadarInsurerStatsForPeriod({ startMonth, endMonth, filters });

  const insurerValues = insurerRows.map((row) => toReaisDb(row.comissao_total || 0));
  const totalComm = insurerValues.reduce((acc, val) => acc + val, 0);
  const topInsurerShare = totalComm > 0 ? Math.max(...insurerValues) / totalComm : 0;

  const bubbleProducts = ramoRows
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
