import { config } from '../config.js';
import { sha256 } from '../utils/hash.js';
import { aliasMaps, applyAlias } from '../utils/aliases.js';
import { isValidCpfCnpj } from '../utils/cpfCnpj.js';
import { normalizeCpfCnpj, normalizeMoney, normalizeMoneyToDb, normalizeRamo } from '../utils/normalize.js';
import { daysDiff, formatDate, formatMonthRef, toDateOnly, toDateTime } from '../utils/date.js';

const requiredFields = [
  'cpf_cnpj',
  'produto',
  'seguradora',
  'data_efetivacao',
  'inicio',
  'termino',
  'premio',
  'comissao_valor',
  'vendedor_id'
];

const getField = (record, key) => {
  if (!record || !key) return null;
  if (record[key] !== undefined) return record[key];
  const upperKey = key?.toUpperCase?.();
  if (upperKey && record[upperKey] !== undefined) return record[upperKey];
  if (key.includes('.')) {
    const parts = key.split('.');
    let current = record;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        current = null;
        break;
      }
    }
    if (current !== null && current !== undefined) return current;
  }
  return null;
};

const resolveVendorId = (record) => {
  const fieldValue = getField(record, config.zohoFields.vendedorId);
  if (fieldValue) return String(fieldValue).trim();
  if (record.Owner && typeof record.Owner === 'object') {
    if (record.Owner.name) return String(record.Owner.name).trim();
    if (record.Owner.email) return String(record.Owner.email).trim();
  }
  if (record.owner && typeof record.owner === 'object') {
    if (record.owner.name) return String(record.owner.name).trim();
    if (record.owner.email) return String(record.owner.email).trim();
  }
  const fallback = record.vendedor_nome || record.vendedor || record.vendedor_id;
  return fallback ? String(fallback).trim() : null;
};

export const normalizeZohoRecord = (record) => {
  const moneyUnits = {
    sourceUnit: config.money?.sourceUnit || 'reais',
    dbUnit: config.money?.dbUnit || 'centavos'
  };
  const rawContractId = getField(record, config.zohoFields.contractId) || record.ID || record.id;
  const cpfCnpj = normalizeCpfCnpj(getField(record, config.zohoFields.cpfCnpj));
  const seguradoNome = getField(record, config.zohoFields.seguradoNome) || record.segurado_nome || '';
  const produtoRaw = getField(record, config.zohoFields.produto);
  const seguradoraRaw = getField(record, config.zohoFields.seguradora) || '';
  const cidade = getField(record, config.zohoFields.cidade) || null;
  const vendedorId = resolveVendorId(record) || 'unknown';
  const dataEfetivacao = toDateOnly(getField(record, config.zohoFields.dataEfetivacao));
  const inicio = toDateOnly(getField(record, config.zohoFields.inicio));
  const termino = toDateOnly(getField(record, config.zohoFields.termino));
  const addedTime = toDateTime(getField(record, config.zohoFields.addedTime));
  const modifiedTime = toDateTime(getField(record, config.zohoFields.modifiedTime));
  const premioRaw = normalizeMoney(getField(record, config.zohoFields.premio));
  const comissaoValorRaw = normalizeMoney(getField(record, config.zohoFields.comissaoValor));
  const premio = normalizeMoneyToDb(premioRaw, moneyUnits);
  const comissaoValor = normalizeMoneyToDb(comissaoValorRaw, moneyUnits);
  const comissaoPctRaw = normalizeMoney(getField(record, config.zohoFields.comissaoPct));
  const comissaoPct = comissaoPctRaw !== null && comissaoPctRaw > 1 ? comissaoPctRaw / 100 : comissaoPctRaw;

  const produtoAliased = applyAlias(produtoRaw, aliasMaps.produto);
  const seguradora = applyAlias(seguradoraRaw, aliasMaps.seguradora) || '';
  const { produto, ramo } = normalizeRamo(produtoAliased);

  const effectiveDate = dataEfetivacao || inicio;
  const dataEfetivacaoISO = formatDate(effectiveDate);
  const inicioISO = formatDate(inicio);
  const terminoISO = formatDate(termino);

  const monthRef = effectiveDate ? formatMonthRef(effectiveDate) : null;

  const rowHashSource = [
    cpfCnpj || '',
    produto || '',
    seguradora || '',
    inicioISO || '',
    terminoISO || '',
    premioRaw ?? '',
    comissaoValorRaw ?? ''
  ].join('|');

  const rowHash = sha256(rowHashSource);

  const isSyntheticId = !rawContractId;
  const contractId = rawContractId ? String(rawContractId) : rowHash;

  const statusRaw = getField(record, config.zohoFields.status) || record.status || record.Status || 'vigente';
  const statusNormalized = String(statusRaw || 'vigente').trim().toLowerCase();

  const comissaoPctValue =
    comissaoPct ?? (premioRaw && comissaoValorRaw ? comissaoValorRaw / premioRaw : null);

  const qualityFlags = [];
  const cpfValid = cpfCnpj ? isValidCpfCnpj(cpfCnpj) : false;
  if (cpfCnpj && !cpfValid) qualityFlags.push('cpf_cnpj_invalid');
  if (inicio && termino && termino < inicio) qualityFlags.push('inicio_after_termino');
  const gapDays =
    dataEfetivacao && inicio ? Math.abs(daysDiff(inicio, dataEfetivacao)) : null;
  if (
    gapDays !== null &&
    Number.isFinite(config.quality?.maxEffectiveDeltaDays) &&
    gapDays > config.quality.maxEffectiveDeltaDays
  ) {
    qualityFlags.push('efetivacao_inicio_gap');
  }
  if (
    comissaoPctValue !== null &&
    Number.isFinite(config.quality?.comissaoPctMin) &&
    comissaoPctValue < config.quality.comissaoPctMin
  ) {
    qualityFlags.push('comissao_pct_low');
  }
  if (
    comissaoPctValue !== null &&
    Number.isFinite(config.quality?.comissaoPctMax) &&
    comissaoPctValue > config.quality.comissaoPctMax
  ) {
    qualityFlags.push('comissao_pct_high');
  }

  const zohoRecordId = rawContractId ? String(rawContractId) : null;
  const normalized = {
    contract_id: contractId,
    zoho_record_id: zohoRecordId,
    cpf_cnpj: cpfCnpj,
    segurado_nome: seguradoNome,
    vendedor_id: vendedorId,
    produto,
    ramo,
    seguradora,
    cidade,
    data_efetivacao: dataEfetivacaoISO,
    inicio: inicioISO,
    termino: terminoISO,
    added_time: addedTime,
    modified_time: modifiedTime,
    zoho_modified_time: modifiedTime,
    status: statusNormalized,
    premio,
    comissao_pct: comissaoPctValue,
    comissao_valor: comissaoValor,
    row_hash: rowHash,
    dedup_group: rowHash,
    is_synthetic_id: isSyntheticId,
    quality_flags: qualityFlags.length ? qualityFlags : null,
    needs_review: qualityFlags.length > 0,
    month_ref: monthRef
  };

  const incomplete = requiredFields.some((field) => {
    if (field === 'cpf_cnpj') return !normalized.cpf_cnpj;
    return normalized[field] === null || normalized[field] === undefined || normalized[field] === '';
  });

  let invalid = false;
  if (inicio && termino && termino < inicio) invalid = true;
  if (!monthRef) invalid = true;

  return {
    ...normalized,
    is_incomplete: incomplete,
    is_invalid: invalid
  };
};
