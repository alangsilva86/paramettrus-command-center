import { config } from '../config.js';
import { sha256 } from '../utils/hash.js';
import { normalizeCpfCnpj, normalizeMoney, normalizeRamo } from '../utils/normalize.js';
import { formatDate, formatMonthRef, toDateOnly } from '../utils/date.js';

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
  return record[key] ?? record[key?.toUpperCase?.()] ?? null;
};

const resolveVendorId = (record) => {
  const fieldValue = getField(record, config.zohoFields.vendedorId);
  if (fieldValue) return String(fieldValue).trim();
  const fallback = record.vendedor_nome || record.vendedor || record.vendedor_id;
  return fallback ? String(fallback).trim() : null;
};

export const normalizeZohoRecord = (record) => {
  const rawContractId = getField(record, config.zohoFields.contractId) || record.ID || record.id;
  const cpfCnpj = normalizeCpfCnpj(getField(record, config.zohoFields.cpfCnpj));
  const seguradoNome = getField(record, config.zohoFields.seguradoNome) || record.segurado_nome || '';
  const produtoRaw = getField(record, config.zohoFields.produto);
  const seguradora = getField(record, config.zohoFields.seguradora) || '';
  const cidade = getField(record, config.zohoFields.cidade) || null;
  const vendedorId = resolveVendorId(record);
  const dataEfetivacao = toDateOnly(getField(record, config.zohoFields.dataEfetivacao));
  const inicio = toDateOnly(getField(record, config.zohoFields.inicio));
  const termino = toDateOnly(getField(record, config.zohoFields.termino));
  const premio = normalizeMoney(getField(record, config.zohoFields.premio));
  const comissaoValor = normalizeMoney(getField(record, config.zohoFields.comissaoValor));
  const comissaoPct = normalizeMoney(getField(record, config.zohoFields.comissaoPct));

  const { produto, ramo } = normalizeRamo(produtoRaw);

  const dataEfetivacaoISO = formatDate(dataEfetivacao);
  const inicioISO = formatDate(inicio);
  const terminoISO = formatDate(termino);

  const referenceDate = dataEfetivacao || inicio || termino;
  const monthRef = referenceDate ? formatMonthRef(referenceDate) : null;

  const rowHashSource = [
    cpfCnpj || '',
    produto || '',
    seguradora || '',
    inicioISO || '',
    terminoISO || '',
    premio ?? '',
    comissaoValor ?? ''
  ].join('|');

  const rowHash = sha256(rowHashSource);

  const isSyntheticId = !rawContractId;
  const contractId = rawContractId ? String(rawContractId) : rowHash;

  const normalized = {
    contract_id: contractId,
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
    status: record.status || record.Status || 'vigente',
    premio,
    comissao_pct: comissaoPct ?? (premio && comissaoValor ? comissaoValor / premio : null),
    comissao_valor: comissaoValor,
    row_hash: rowHash,
    dedup_group: rowHash,
    is_synthetic_id: isSyntheticId,
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
