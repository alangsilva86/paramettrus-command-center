import { query } from '../db.js';
import { config } from '../config.js';
import { addDays, daysDiff, toDateOnly } from '../utils/date.js';

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

const fetchContracts = async () => {
  const result = await query(
    `SELECT contract_id, cpf_cnpj, segurado_nome, vendedor_id, ramo, premio, comissao_valor, inicio, termino, status
     FROM contracts_norm
     WHERE is_invalid = FALSE`
  );
  return result.rows;
};

export const getRenewalMetrics = async ({ referenceDate = new Date() } = {}) => {
  const contracts = await fetchContracts();
  const grouped = buildRenewalIndex(contracts);
  const reference = toDateOnly(referenceDate);
  const graceDays = Number(config.ingest.renewalGraceDays || 0);

  const d5 = [];
  const d7 = [];
  const d15 = [];
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
    }

    if (days < 0 && (graceDays === 0 || days < -graceDays)) {
      black.push({ ...contract, days_to_end: days });
    }
  }

  const sortByPriority = (a, b) => {
    if (a.days_to_end !== b.days_to_end) return a.days_to_end - b.days_to_end;
    return Number(b.comissao_valor || 0) - Number(a.comissao_valor || 0);
  };

  d5.sort(sortByPriority);
  d7.sort(sortByPriority);
  d15.sort(sortByPriority);

  const d5Risk = d5.reduce((sum, item) => sum + Number(item.comissao_valor || 0), 0);
  const d7Risk = d7.reduce((sum, item) => sum + Number(item.comissao_valor || 0), 0);
  const d15Risk = d15.reduce((sum, item) => sum + Number(item.comissao_valor || 0), 0);

  return {
    d5,
    d7,
    d15,
    d5Risk,
    d7Risk,
    d15Risk,
    black,
    blackListCount: black.length
  };
};

export const getVendorPenaltyMap = async (monthRef) => {
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
  return map;
};

export const listRenewals = async ({ windowDays = 15 }) => {
  const metrics = await getRenewalMetrics();
  if (windowDays <= 5) return metrics.d5;
  if (windowDays <= 7) return metrics.d7;
  return metrics.d15;
};
