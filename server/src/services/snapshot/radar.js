import { toReaisDb } from './constants.js';
import { toNumber } from './numbers.js';
import {
  fetchRadarInsurerStatsForMonth,
  fetchRadarInsurerStatsForPeriod,
  fetchRadarRamoStatsForMonth,
  fetchRadarRamoStatsForPeriod
} from './repository.js';

const buildRadarDataFromStats = ({ ramoRows, insurerRows, blackByRamo }) => {
  const insurerValues = insurerRows.map((row) => toReaisDb(row.comissao_total || 0));
  const totalComm = insurerValues.reduce((acc, val) => acc + val, 0);
  const topInsurerShare = totalComm > 0 ? Math.max(...insurerValues) / totalComm : 0;

  const bubbleProducts = ramoRows
    .filter((row) => row.ramo)
    .map((row) => {
      const comissaoTotal = toReaisDb(row.comissao_total || 0);
      const premioTotal = toReaisDb(row.premio_total || 0);
      const count = toNumber(row.contracts_count || 0);
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

export const getRadarDataForMonth = async ({ monthRef, filters = {}, blackByRamo }) => {
  const [ramoRows, insurerRows] = await Promise.all([
    fetchRadarRamoStatsForMonth({ monthRef, filters }),
    fetchRadarInsurerStatsForMonth({ monthRef, filters })
  ]);

  return buildRadarDataFromStats({ ramoRows, insurerRows, blackByRamo });
};

export const getRadarDataForPeriod = async ({ startMonth, endMonth, filters = {}, blackByRamo }) => {
  const [ramoRows, insurerRows] = await Promise.all([
    fetchRadarRamoStatsForPeriod({ startMonth, endMonth, filters }),
    fetchRadarInsurerStatsForPeriod({ startMonth, endMonth, filters })
  ]);

  return buildRadarDataFromStats({ ramoRows, insurerRows, blackByRamo });
};
