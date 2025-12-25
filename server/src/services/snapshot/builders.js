import { config } from '../../config.js';
import {
  addDays,
  countBusinessDays,
  endOfMonth,
  formatDate,
  formatMonthRef,
  startOfMonth
} from '../../utils/date.js';
import { toReais } from '../../utils/money.js';
import { logInfo, logSuccess, logWarn } from '../../utils/logger.js';
import { computeLedgerForMonth } from '../ledgerService.js';
import { getRulesVersionById, getRulesVersionForDate } from '../rulesService.js';
import { getRenewalMetrics } from '../renewalService.js';
import { getCustomersMonoprodutoPct, getDailyTrend, getDailyTrendForPeriod, getDataCoverage, getDataCoverageForPeriod, getFilterOptions, getFilterOptionsForPeriod, getMonthlyAggregates, getPeriodAggregates } from './aggregates.js';
import { SNAPSHOT_MONEY_UNIT, toReaisDb } from './constants.js';
import { buildMonthlySnapshotDto, buildPeriodSnapshotDto } from './dto.js';
import { getLeaderboard, getLeaderboardForPeriod } from './leaderboard.js';
import { getMixData, getMixDataForPeriod } from './mix.js';
import { getRadarData, getRadarDataForPeriod } from './radar.js';
import { validateSnapshot } from './schema.js';
import {
  fetchAvailableMonthBounds,
  fetchContractsForMonth,
  fetchCurveShare,
  fetchLatestIngestionStatus,
  insertAuditLog,
  insertSnapshotRow
} from './repository.js';
import { clampMonthRef, listMonthRefs, normalizeMonthRange, shiftDateByMonths, shiftMonthRef } from './utils.js';
import { getVendorStats, getVendorStatsForPeriod } from './vendorStats.js';

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
  const overrideRules = rulesOverride || (rulesVersionId ? await getRulesVersionById(rulesVersionId) : null);
  if (rulesVersionId && !overrideRules) {
    throw new Error('rules_version_id invalido');
  }
  const rules = overrideRules || (await getRulesVersionForDate(monthStart));
  const metaComissao = toReais(rules.meta_global_comissao || 0, SNAPSHOT_MONEY_UNIT);

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
    meta_comissao: Number(metaComissao.toFixed(2)),
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

  const contracts = await fetchContractsForMonth({ monthRef, includeIncomplete: true, filters });
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
  const curveShare = await fetchCurveShare(dayOfMonth, config.ingest.defaultCurveId);
  const shareEsperado = curveShare || dayOfMonth / monthEnd.getUTCDate();
  if (!curveShare) {
    logWarn('snapshot', 'Curva historica indisponivel, usando fallback linear', {
      month_ref: monthRef,
      day: dayOfMonth
    });
    await insertAuditLog({
      eventType: 'CURVE_FALLBACK',
      payload: { month_ref: monthRef, day: dayOfMonth }
    });
  }
  const forecastComissao = shareEsperado > 0 ? comissaoMtd / shareEsperado : 0;

  const businessDaysElapsed = countBusinessDays(monthStart, referenceDate);
  const diasUteisRestantes = Math.max(0, rules.dias_uteis - businessDaysElapsed);
  const gap = Math.max(0, metaComissao - comissaoMtd);
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
  const status = await fetchLatestIngestionStatus();
  logInfo('snapshot', 'Status de ingestao', {
    status: status.status,
    finished_at: status.finishedAt
  });

  const snapshot = buildMonthlySnapshotDto({
    monthRef,
    processing: {
      duration_ms: Date.now() - startedAt,
      generated_at: new Date().toISOString()
    },
    dataCoverage,
    filterOptions,
    kpis: {
      meta_comissao: Number(metaComissao.toFixed(2)),
      comissao_mtd: comissaoMtd,
      premio_mtd: premioMtd,
      ticket_medio: ticketMedio,
      margem_media_pct: margemMedia,
      pct_meta: metaComissao > 0 ? comissaoMtd / metaComissao : 0,
      forecast_comissao: forecastComissao,
      forecast_pct_meta: metaComissao > 0 ? forecastComissao / metaComissao : 0,
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
    trendDaily,
    renewals: {
      d7: { count: renewals.d7.length, comissao_risco: renewals.d7Risk },
      d15: { count: renewals.d15.length, comissao_risco: renewals.d15Risk },
      d30: { count: renewals.d30.length, comissao_risco: renewals.d30Risk }
    },
    leaderboard,
    vendorStats,
    radar: {
      bubble_products: radar.bubbleProducts,
      top_insurer_share: radar.topInsurerShare
    },
    mix
  });

  validateSnapshot(snapshot, { mode: 'monthly' });

  const staleData = status.status === 'STALE_DATA';
  if (persist) {
    await insertSnapshotRow({
      monthRef,
      scenarioId,
      rulesVersionId: rules.rules_version_id,
      data: snapshot,
      isScenario: Boolean(scenarioId),
      staleData
    });
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

export const buildPeriodSnapshot = async ({ startMonth, endMonth, filters = {} }) => {
  const startedAt = Date.now();
  const requestedRange = normalizeMonthRange(startMonth, endMonth);
  const bounds = await fetchAvailableMonthBounds();
  const clampedStart = clampMonthRef(requestedRange.start, bounds.min, bounds.max);
  const clampedEnd = clampMonthRef(requestedRange.end, bounds.min, bounds.max);
  const actualStart = clampedStart || requestedRange.start;
  const actualEnd = clampedEnd || requestedRange.end;
  const range = normalizeMonthRange(actualStart, actualEnd);
  const rangeStart = range.start;
  const rangeEnd = range.end;
  const months = listMonthRefs(rangeStart, rangeEnd);
  const periodClamped = requestedRange.start !== rangeStart || requestedRange.end !== rangeEnd;
  const periodLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}..${rangeEnd}`;
  const availability = bounds.min || bounds.max ? { start: bounds.min, end: bounds.max } : null;

  logInfo('snapshot', 'Montando snapshot de periodo', {
    start_month: rangeStart,
    end_month: rangeEnd,
    requested_start: requestedRange.start,
    requested_end: requestedRange.end,
    months: months.length,
    clamped: periodClamped,
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
    (sum, rules) => sum + toReais(rules.meta_global_comissao || 0, SNAPSHOT_MONEY_UNIT),
    0
  );
  const endMonthRules = await resolveRulesForMonth(rangeEnd);

  const comissaoTotal = currentAgg.comissaoTotal;
  const premioTotal = currentAgg.premioTotal;
  const margemMedia = currentAgg.margemPct;
  const ticketMedio = currentAgg.ticketMedio;

  const dayOfMonth = referenceDate.getUTCDate();
  const curveShare =
    referenceMonthRef === rangeEnd
      ? await fetchCurveShare(dayOfMonth, config.ingest.defaultCurveId)
      : null;
  const shareEsperado =
    curveShare || (referenceMonthRef === rangeEnd ? dayOfMonth / rangeEndDate.getUTCDate() : 1);
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

  const snapshot = buildPeriodSnapshotDto({
    monthRef: rangeEnd,
    processing: {
      duration_ms: Date.now() - startedAt,
      generated_at: new Date().toISOString()
    },
    period: {
      start: rangeStart,
      end: rangeEnd,
      months: months.length,
      label: periodLabel,
      requested: {
        start: requestedRange.start,
        end: requestedRange.end
      },
      clamped: periodClamped,
      available: availability
    },
    dataCoverage,
    filterOptions,
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
    trendDaily,
    renewals: {
      d7: { count: renewals.d7.length, comissao_risco: renewals.d7Risk },
      d15: { count: renewals.d15.length, comissao_risco: renewals.d15Risk },
      d30: { count: renewals.d30.length, comissao_risco: renewals.d30Risk }
    },
    leaderboard,
    vendorStats,
    radar: {
      bubble_products: radar.bubbleProducts,
      top_insurer_share: radar.topInsurerShare
    },
    mix
  });

  validateSnapshot(snapshot, { mode: 'period' });

  logSuccess('snapshot', 'Snapshot de periodo pronto', {
    start_month: rangeStart,
    end_month: rangeEnd,
    duration_ms: Date.now() - startedAt
  });

  return snapshot;
};
