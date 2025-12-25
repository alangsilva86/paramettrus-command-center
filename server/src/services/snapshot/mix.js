import { toReaisDb } from './constants.js';
import { fetchMixAggregate, fetchMixAggregateForPeriod } from './repository.js';
import { monthRefToIndex, shiftMonthRef } from './utils.js';

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

const mapMixRows = (rows) =>
  rows
    .filter((row) => row.key)
    .map((row) => ({
      ...row,
      comissao_total: toReaisDb(row.comissao_total || 0),
      premio_total: toReaisDb(row.premio_total || 0),
      contracts_count: Number(row.contracts_count || 0)
    }));

const getMixAggregate = async ({ monthRef, filters = {}, field }) => {
  const rows = await fetchMixAggregate({ monthRef, filters, field });
  return mapMixRows(rows);
};

const getMixAggregateForPeriod = async ({ startMonth, endMonth, filters = {}, field }) => {
  const rows = await fetchMixAggregateForPeriod({ startMonth, endMonth, filters, field });
  return mapMixRows(rows);
};

export const getMixData = async ({ monthRef, filters = {}, blackByRamo }) => {
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

export const getMixDataForPeriod = async ({ startMonth, endMonth, filters = {}, blackByRamo }) => {
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
