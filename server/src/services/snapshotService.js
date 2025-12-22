import { query } from '../db.js';
import { config } from '../config.js';
import { countBusinessDays, endOfMonth, startOfMonth } from '../utils/date.js';
import { computeLedgerForMonth } from './ledgerService.js';
import { getRulesVersionById, getRulesVersionForDate } from './rulesService.js';
import { getRenewalMetrics } from './renewalService.js';

const fetchContractsForMonth = async (monthRef) => {
  const result = await query(
    `SELECT *
     FROM contracts_norm
     WHERE month_ref = $1
       AND is_incomplete = FALSE
       AND is_invalid = FALSE`,
    [monthRef]
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

const getLeaderboard = async (monthRef, scenarioId) => {
  const ledger = await query(
    `SELECT * FROM xp_ledger
     WHERE month_ref = $1 AND scenario_id IS NOT DISTINCT FROM $2`,
    [monthRef, scenarioId || null]
  );

  const contracts = await query(
    `SELECT contract_id, comissao_valor
     FROM contracts_norm
     WHERE month_ref = $1`,
    [monthRef]
  );
  const commByContract = new Map(
    contracts.rows.map((row) => [row.contract_id, Number(row.comissao_valor || 0)])
  );

  const vendorMap = new Map();
  ledger.rows.forEach((entry) => {
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

const getRadarData = async (blackByRamo) => {
  const contracts = await query(
    `SELECT contract_id, ramo, seguradora, comissao_valor, premio
     FROM contracts_norm
     WHERE is_incomplete = FALSE AND is_invalid = FALSE`
  );

  const ramoStats = new Map();
  const insurerStats = new Map();

  contracts.rows.forEach((row) => {
    const ramo = row.ramo;
    if (!ramoStats.has(ramo)) {
      ramoStats.set(ramo, { comm: 0, prem: 0, count: 0, black: 0 });
    }
    const stat = ramoStats.get(ramo);
    stat.comm += Number(row.comissao_valor || 0);
    stat.prem += Number(row.premio || 0);
    stat.count += 1;

    const insurer = row.seguradora || 'N/D';
    insurerStats.set(insurer, (insurerStats.get(insurer) || 0) + Number(row.comissao_valor || 0));
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

const getCustomersMonoprodutoPct = async () => {
  const result = await query('SELECT COUNT(*)::int AS total, SUM(CASE WHEN is_monoproduto THEN 1 ELSE 0 END)::int AS mono FROM customers');
  if (result.rowCount === 0) return 0;
  const { total, mono } = result.rows[0];
  return total > 0 ? mono / total : 0;
};

export const buildMonthlySnapshot = async ({ monthRef, scenarioId = null, force = false, rulesVersionId = null }) => {
  const monthStart = startOfMonth(monthRef);
  const overrideRules = rulesVersionId ? await getRulesVersionById(rulesVersionId) : null;
  const rules = overrideRules || (await getRulesVersionForDate(monthStart));

  const rulesVersionToUse = overrideRules ? overrideRules.rules_version_id : null;
  await computeLedgerForMonth({ monthRef, scenarioId, force, rulesVersionId: rulesVersionToUse });

  const contracts = await fetchContractsForMonth(monthRef);
  const comissaoMtd = contracts.reduce((sum, c) => sum + Number(c.comissao_valor || 0), 0);

  const today = new Date();
  const monthEnd = endOfMonth(monthRef);
  const referenceDate = today <= monthEnd ? today : monthEnd;
  const dayOfMonth = referenceDate.getUTCDate();
  const curveShare = await getCurveShare(dayOfMonth, config.ingest.defaultCurveId);
  const shareEsperado = curveShare || dayOfMonth / monthEnd.getUTCDate();
  if (!curveShare) {
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
    .reduce((sum, c) => sum + Number(c.comissao_valor || 0), 0);
  const autoShare = comissaoMtd > 0 ? autoComm / comissaoMtd : 0;
  const monoprodutoPct = await getCustomersMonoprodutoPct();

  const renewals = await getRenewalMetrics({ referenceDate });
  const blackByRamo = new Map();
  renewals.black.forEach((contract) => {
    blackByRamo.set(contract.ramo, (blackByRamo.get(contract.ramo) || 0) + 1);
  });
  const leaderboard = await getLeaderboard(monthRef, scenarioId);
  const radar = await getRadarData(blackByRamo);
  const status = await getLatestIngestionStatus();

  const snapshot = {
    month: monthRef,
    kpis: {
      meta_comissao: Number(rules.meta_global_comissao),
      comissao_mtd: comissaoMtd,
      pct_meta: rules.meta_global_comissao > 0 ? comissaoMtd / rules.meta_global_comissao : 0,
      forecast_comissao: forecastComissao,
      forecast_pct_meta:
        rules.meta_global_comissao > 0 ? forecastComissao / rules.meta_global_comissao : 0,
      gap_diario: gapDiario,
      auto_share_comissao: autoShare,
      monoproduto_pct: monoprodutoPct
    },
    renewals: {
      d7: { count: renewals.d7.length, comissao_risco: renewals.d7Risk },
      d15: { count: renewals.d15.length, comissao_risco: renewals.d15Risk }
    },
    leaderboard,
    radar: {
      bubble_products: radar.bubbleProducts,
      top_insurer_share: radar.topInsurerShare
    }
  };

  const staleData = status.status === 'STALE_DATA';
  await query(
    `INSERT INTO snapshots_month (month_ref, scenario_id, rules_version_id, data, is_scenario, stale_data)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [monthRef, scenarioId, rules.rules_version_id, JSON.stringify(snapshot), Boolean(scenarioId), staleData]
  );

  return snapshot;
};

export const getSnapshotCached = async ({ monthRef, scenarioId = null }) => {
  const result = await query(
    `SELECT data
     FROM snapshots_month
     WHERE month_ref = $1 AND scenario_id IS NOT DISTINCT FROM $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [monthRef, scenarioId || null]
  );
  if (result.rowCount === 0) return null;
  return result.rows[0].data;
};
