import { query } from '../db.js';
import { sha256 } from '../utils/hash.js';
import { toDateOnly } from '../utils/date.js';
import { toReais } from '../utils/money.js';
import { buildStatusFilter } from '../utils/status.js';
import { getRulesVersionById, getRulesVersionForDate } from './rulesService.js';
import { getVendorPenaltyMap } from './renewalService.js';
import { config } from '../config.js';
import { logInfo, logSuccess, logWarn } from '../utils/logger.js';

const sortContracts = (a, b) => {
  if (a.data_efetivacao === b.data_efetivacao) {
    return String(a.contract_id).localeCompare(String(b.contract_id));
  }
  return String(a.data_efetivacao).localeCompare(String(b.data_efetivacao));
};

const computeCrossSellEvents = (contracts) => {
  const events = new Map();
  const customerState = new Map();

  contracts.sort(sortContracts).forEach((contract) => {
    const cpf = contract.cpf_cnpj;
    if (!cpf) {
      events.set(contract.contract_id, {
        crossSell: false,
        comboBreaker: false,
        ignoredCpf: true
      });
      return;
    }

    if (!customerState.has(cpf)) {
      customerState.set(cpf, new Set());
    }
    const state = customerState.get(cpf);
    const beforeSize = state.size;
    state.add(contract.ramo);
    const afterSize = state.size;

    const crossSell = beforeSize === 1 && afterSize >= 2;
    const comboBreaker = state.has('AUTO') && state.has('VIDA');

    events.set(contract.contract_id, {
      crossSell,
      comboBreaker,
      ignoredCpf: false
    });
  });

  return events;
};

const getLatestLedgerEntry = async (contractId, monthRef, scenarioId) => {
  const result = await query(
    `SELECT ledger_id
     FROM xp_ledger
     WHERE contract_id = $1 AND month_ref = $2 AND scenario_id IS NOT DISTINCT FROM $3
     ORDER BY calculated_at DESC
     LIMIT 1`,
    [contractId, monthRef, scenarioId || null]
  );
  return result.rowCount > 0 ? result.rows[0].ledger_id : null;
};

const fetchContractsForCrossSell = async () => {
  const params = [];
  const conditions = ['is_incomplete = FALSE', 'is_invalid = FALSE'];
  const statusFilter = buildStatusFilter(params, config.contractStatus);
  if (statusFilter) {
    conditions.push(statusFilter);
  }
  const result = await query(
    `SELECT contract_id, cpf_cnpj, ramo, data_efetivacao
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     ORDER BY data_efetivacao ASC, contract_id ASC`,
    params
  );
  return result.rows;
};

const fetchContractsForMonth = async (monthRef) => {
  const params = [monthRef];
  const conditions = ['month_ref = $1', 'is_incomplete = FALSE', 'is_invalid = FALSE'];
  const statusFilter = buildStatusFilter(params, config.contractStatus);
  if (statusFilter) {
    conditions.push(statusFilter);
  }
  const result = await query(
    `SELECT *
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}
     ORDER BY data_efetivacao ASC, contract_id ASC`,
    params
  );
  return result.rows;
};

export const computeLedgerForMonth = async ({ monthRef, scenarioId = null, force = false, rulesVersionId = null }) => {
  if (!monthRef) throw new Error('monthRef obrigatório');

  logInfo('ledger', 'Iniciando calculo de XP', {
    month_ref: monthRef,
    scenario_id: scenarioId,
    force,
    rules_version_id: rulesVersionId || 'auto'
  });

  if (config.ingest.lockedMonths.includes(monthRef) && !force) {
    logWarn('ledger', 'Mes bloqueado via config, precisa force', { month_ref: monthRef });
    throw new Error('Mês fechado. Use force_reprocess=true.');
  }

  const locked = await query(
    'SELECT is_closed FROM month_locks WHERE month_ref = $1 LIMIT 1',
    [monthRef]
  );
  if (locked.rowCount > 0 && locked.rows[0].is_closed && !force) {
    logWarn('ledger', 'Mes fechado no banco, precisa force', { month_ref: monthRef });
    throw new Error('Mês fechado. Use force_reprocess=true.');
  }

  const allContracts = await fetchContractsForCrossSell();
  const crossSellEvents = computeCrossSellEvents(allContracts);

  const monthContracts = await fetchContractsForMonth(monthRef);
  const penaltyMap = await getVendorPenaltyMap(monthRef);

  const overrideRules = rulesVersionId ? await getRulesVersionById(rulesVersionId) : null;

  logInfo('ledger', 'Contratos carregados', {
    total_contratos: allContracts.length,
    contratos_mes: monthContracts.length
  });
  if (monthContracts.length === 0) {
    logWarn('ledger', 'Nenhum contrato elegivel no mes', { month_ref: monthRef });
  }

  const eventStats = { cross_sell: 0, combo_breaker: 0, ignored_cpf: 0 };
  for (const event of crossSellEvents.values()) {
    if (event.crossSell) eventStats.cross_sell += 1;
    if (event.comboBreaker) eventStats.combo_breaker += 1;
    if (event.ignoredCpf) eventStats.ignored_cpf += 1;
  }
  logInfo('ledger', 'Eventos cross-sell detectados', eventStats);
  logInfo('ledger', 'Vendedores com bonus travado', { vendedores_bloqueados: penaltyMap.size });

  let ledgerCount = 0;
  let bonusLockedCount = 0;
  let crossSellAwarded = 0;
  let comboAwarded = 0;
  let salvageAwarded = 0;

  for (const contract of monthContracts) {
    const dataEfetivacao = toDateOnly(contract.data_efetivacao);
    const rules = overrideRules || (await getRulesVersionForDate(dataEfetivacao));
    const weights = rules.product_weights || {};
    const bonusEvents = rules.bonus_events || {};
    const weight = weights[contract.ramo] ?? 1;

    const comissao = toReais(contract.comissao_valor);
    const xpBase = Number(((comissao / 10) * weight).toFixed(2));
    let xpBonus = 0;
    const reasons = [];

    const penaltyLocked = penaltyMap.get(contract.vendedor_id) === true;
    if (!penaltyLocked) {
      const event = crossSellEvents.get(contract.contract_id);
      if (event?.crossSell) {
        xpBonus += Number(bonusEvents.cross_sell || 0);
        reasons.push('CROSS_SELL');
        crossSellAwarded += 1;
      }
      if (event?.comboBreaker) {
        xpBonus += Number(bonusEvents.combo_breaker || 0);
        reasons.push('COMBO_BREAKER');
        comboAwarded += 1;
      }

      const salvageActions = await query(
        `SELECT 1
         FROM renewal_actions
         WHERE contract_id = $1 AND action_type = 'RENEWED'
         LIMIT 1`,
        [contract.contract_id]
      );
      if (salvageActions.rowCount > 0 && bonusEvents.salvamento_d5) {
        xpBonus += Number(bonusEvents.salvamento_d5);
        reasons.push('SALVAMENTO_D5');
        salvageAwarded += 1;
      }
    } else {
      reasons.push('BONUS_LOCKED');
      bonusLockedCount += 1;
    }

    const xpTotal = Number((xpBase + xpBonus).toFixed(2));
    const calcHash = sha256(
      JSON.stringify({
        contract_id: contract.contract_id,
        rules_version_id: rules.rules_version_id,
        xp_base: xpBase,
        xp_bonus: xpBonus,
        reasons
      })
    );

    const supersedesId = await getLatestLedgerEntry(contract.contract_id, monthRef, scenarioId);

    await query(
      `INSERT INTO xp_ledger (
        contract_id,
        cpf_cnpj,
        vendedor_id,
        rules_version_id,
        xp_base,
        xp_bonus,
        xp_total,
        reasons,
        calculated_at,
        calc_hash,
        month_ref,
        supersedes_ledger_id,
        is_scenario,
        scenario_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )`,
      [
        contract.contract_id,
        contract.cpf_cnpj,
        contract.vendedor_id,
        rules.rules_version_id,
        xpBase,
        xpBonus,
        xpTotal,
        reasons,
        new Date(),
        calcHash,
        monthRef,
        supersedesId,
        Boolean(scenarioId),
        scenarioId
      ]
    );

    ledgerCount += 1;
  }

  await query(
    `INSERT INTO audit_logs (event_type, payload)
     VALUES ($1, $2::jsonb)`,
    [
      'LEDGER_RECALCULATED',
      JSON.stringify({ month_ref: monthRef, scenario_id: scenarioId, force })
    ]
  );

  logSuccess('ledger', 'Ledger atualizado', {
    month_ref: monthRef,
    entries: ledgerCount,
    cross_sell_awards: crossSellAwarded,
    combo_awards: comboAwarded,
    salvamento_awards: salvageAwarded,
    bonus_locked: bonusLockedCount
  });

  return true;
};
