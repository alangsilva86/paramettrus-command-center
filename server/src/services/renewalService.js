import { query } from '../db.js';
import { config } from '../config.js';
import { addDays, daysDiff, toDateOnly } from '../utils/date.js';
import { toReais } from '../utils/money.js';
import { buildStatusFilter } from '../utils/status.js';
import { logInfo, logWarn } from '../utils/logger.js';

const moneyUnit = config.money?.dbUnit || 'centavos';
const toReaisDb = (value) => toReais(value, moneyUnit);

const buildRenewalIndex = (contracts) => {
  const grouped = new Map();
  contracts.forEach((contract) => {
    if (!contract.cpf_cnpj || !contract.ramo) return;
    const key = `${contract.cpf_cnpj}|${contract.ramo}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(contract);
  });

  for (const list of grouped.values()) {
    list.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  }
  return grouped;
};

const findSuccessor = (contract, grouped) => {
  if (!contract.cpf_cnpj || !contract.ramo || !contract.termino) return null;
  const key = `${contract.cpf_cnpj}|${contract.ramo}`;
  const list = grouped.get(key) || [];
  const termino = toDateOnly(contract.termino);
  if (!termino) return null;

  const minDate = addDays(termino, -30);
  const maxDate = addDays(termino, 30);
  let best = null;
  let bestDiff = Infinity;

  for (const candidate of list) {
    if (candidate.contract_id === contract.contract_id) continue;
    const inicio = toDateOnly(candidate.inicio);
    if (!inicio) continue;
    if (inicio < minDate || inicio > maxDate) continue;
    const diff = Math.abs(inicio.getTime() - termino.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }

  return best;
};

const fetchContracts = async ({ vendorId = null, ramo = null } = {}) => {
  const conditions = ['is_invalid = FALSE'];
  const params = [];
  const statusFilter = buildStatusFilter(params, config.contractStatus);
  if (statusFilter) {
    conditions.push(statusFilter);
  }
  if (vendorId) {
    params.push(vendorId);
    conditions.push(`vendedor_id = $${params.length}`);
  }
  if (ramo) {
    params.push(ramo);
    conditions.push(`ramo = $${params.length}`);
  }
  const result = await query(
    `SELECT contract_id,
            cpf_cnpj,
            segurado_nome,
            vendedor_id,
            ramo,
            premio,
            comissao_valor,
            inicio,
            termino,
            status
     FROM contracts_norm
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  return result.rows.map((row) => ({
    ...row,
    premio: toReaisDb(row.premio),
    comissao_valor: toReaisDb(row.comissao_valor)
  }));
};

const loadLatestActions = async (contractIds) => {
  if (!contractIds.length) return new Map();
  const result = await query(
    `SELECT DISTINCT ON (contract_id)
        contract_id,
        vendedor_id,
        action_type,
        note,
        created_at
     FROM renewal_actions
     WHERE contract_id = ANY($1)
     ORDER BY contract_id, created_at DESC`,
    [contractIds]
  );
  return new Map(result.rows.map((row) => [row.contract_id, row]));
};

const computeRenewalProbability = (daysToEnd, stage) => {
  const normalized = String(stage || '').toUpperCase();
  if (normalized.includes('JUSTIFIED') || normalized.includes('CANCEL') || normalized.includes('LOST')) return 0.1;
  if (normalized.includes('RENOV') || normalized.includes('RENEW') || normalized.includes('CLOSED_WON')) return 0.95;
  if (normalized.includes('PROPOSTA') || normalized.includes('NEGOCI')) return 0.7;
  if (normalized.includes('CONTATO') || normalized.includes('CONTACT')) return 0.5;
  if (normalized.includes('SEM_CONTATO') || normalized.includes('NO_CONTACT')) return 0.3;
  if (daysToEnd <= 5) return 0.35;
  if (daysToEnd <= 15) return 0.5;
  if (daysToEnd <= 30) return 0.6;
  return 0.7;
};

const enrichRenewals = (items, actionsMap) => {
  return items.map((item) => {
    const action = actionsMap.get(item.contract_id);
    const stage = action?.action_type || 'SEM_ACAO';
    const owner = action?.vendedor_id || item.vendedor_id;
    const probability = computeRenewalProbability(item.days_to_end, stage);
    const comissao = Number(item.comissao_valor || 0);
    const impactScore = comissao * (1 - probability);
    return {
      ...item,
      stage,
      owner,
      renewal_probability: Number(probability.toFixed(2)),
      impact_score: Number(impactScore.toFixed(2))
    };
  });
};

export const getRenewalMetrics = async ({ referenceDate = new Date(), vendorId = null, ramo = null } = {}) => {
  const reference = toDateOnly(referenceDate);
  logInfo('renewal', 'Calculando semaforo de renovacao', {
    referencia: reference ? reference.toISOString().slice(0, 10) : null
  });
  const contracts = await fetchContracts({ vendorId, ramo });
  if (contracts.length === 0) {
    logWarn('renewal', 'Nenhum contrato disponivel para renovacao');
  }
  const grouped = buildRenewalIndex(contracts);
  const graceDays = Number(config.ingest.renewalGraceDays || 0);

  const d5 = [];
  const d7 = [];
  const d15 = [];
  const d30 = [];
  const black = [];

  for (const contract of contracts) {
    const termino = toDateOnly(contract.termino);
    if (!termino) continue;
    const successor = findSuccessor(contract, grouped);
    if (successor) continue;

    const days = daysDiff(termino, reference);
    if (days === null) continue;

    if (days <= 5 && days >= 0) {
      d5.push({ ...contract, days_to_end: days });
      d7.push({ ...contract, days_to_end: days });
    } else if (days <= 7 && days > 5) {
      d7.push({ ...contract, days_to_end: days });
    } else if (days <= 15 && days > 7) {
      d15.push({ ...contract, days_to_end: days });
    } else if (days <= 30 && days > 15) {
      d30.push({ ...contract, days_to_end: days });
    }

    if (days < 0 && (graceDays === 0 || days < -graceDays)) {
      black.push({ ...contract, days_to_end: days });
    }
  }

  const actionsMap = await loadLatestActions([
    ...d5.map((item) => item.contract_id),
    ...d7.map((item) => item.contract_id),
    ...d15.map((item) => item.contract_id),
    ...d30.map((item) => item.contract_id)
  ]);

  const d5Enriched = enrichRenewals(d5, actionsMap);
  const d7Enriched = enrichRenewals(d7, actionsMap);
  const d15Enriched = enrichRenewals(d15, actionsMap);
  const d30Enriched = enrichRenewals(d30, actionsMap);

  const sortByPriority = (a, b) => {
    const impactDiff = Number(b.impact_score || 0) - Number(a.impact_score || 0);
    if (impactDiff !== 0) return impactDiff;
    if (a.days_to_end !== b.days_to_end) return a.days_to_end - b.days_to_end;
    return Number(b.comissao_valor || 0) - Number(a.comissao_valor || 0);
  };

  d5Enriched.sort(sortByPriority);
  d7Enriched.sort(sortByPriority);
  d15Enriched.sort(sortByPriority);
  d30Enriched.sort(sortByPriority);

  const d5Risk = d5Enriched.reduce((sum, item) => sum + Number(item.comissao_valor || 0), 0);
  const d7Risk = d7Enriched.reduce((sum, item) => sum + Number(item.comissao_valor || 0), 0);
  const d15Risk = d15Enriched.reduce((sum, item) => sum + Number(item.comissao_valor || 0), 0);
  const d30Risk = d30Enriched.reduce((sum, item) => sum + Number(item.comissao_valor || 0), 0);

  logInfo('renewal', 'Resumo TLP', {
    d5: d5Enriched.length,
    d7: d7Enriched.length,
    d15: d15Enriched.length,
    d30: d30Enriched.length,
    black: black.length
  });

  return {
    d5: d5Enriched,
    d7: d7Enriched,
    d15: d15Enriched,
    d30: d30Enriched,
    d5Risk,
    d7Risk,
    d15Risk,
    d30Risk,
    black,
    blackListCount: black.length
  };
};

export const getVendorPenaltyMap = async (monthRef) => {
  logInfo('renewal', 'Verificando penalidades por churn', { month_ref: monthRef });
  const metrics = await getRenewalMetrics();
  const map = new Map();
  if (metrics.black.length === 0) return map;
  for (const contract of metrics.black) {
    const justified = await query(
      `SELECT 1
       FROM renewal_actions
       WHERE contract_id = $1 AND action_type = 'JUSTIFIED'
       LIMIT 1`,
      [contract.contract_id]
    );
    if (justified.rowCount === 0) {
      map.set(contract.vendedor_id, true);
    }
  }
  logInfo('renewal', 'Penalidades aplicadas', { vendedores_bloqueados: map.size });
  return map;
};

export const listRenewals = async ({ windowDays = 15, vendorId = null, ramo = null } = {}) => {
  const metrics = await getRenewalMetrics({ vendorId, ramo });
  if (windowDays <= 5) return metrics.d5;
  if (windowDays <= 7) return metrics.d7;
  if (windowDays <= 15) return metrics.d15;
  return metrics.d30;
};
