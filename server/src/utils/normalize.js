import { toDbMoney } from './money.js';

const stripAccents = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const normalizeText = (value) => {
  if (!value) return '';
  return stripAccents(String(value)).trim().toUpperCase();
};

export const normalizeCpfCnpj = (value) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 11 && digits.length !== 14) return null;
  return digits;
};

export const normalizeMoney = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return Number(value);
  const raw = String(value).trim();
  const negative = raw.startsWith('-');
  let cleaned = negative ? raw.slice(1) : raw;
  cleaned = cleaned.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = '';

  if (lastComma > lastDot) {
    const integerPart = cleaned.slice(0, lastComma).replace(/[.,]/g, '');
    const fractionPart = cleaned.slice(lastComma + 1).replace(/[.,]/g, '');
    normalized = fractionPart ? `${integerPart || '0'}.${fractionPart}` : `${integerPart || '0'}`;
  } else if (lastDot > lastComma) {
    const integerPart = cleaned.slice(0, lastDot).replace(/[.,]/g, '');
    const fractionPart = cleaned.slice(lastDot + 1).replace(/[.,]/g, '');
    normalized = fractionPart ? `${integerPart || '0'}.${fractionPart}` : `${integerPart || '0'}`;
  } else {
    normalized = cleaned.replace(/[.,]/g, '');
  }

  if (!normalized) return null;
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
};

export const normalizeMoneyToDb = (value, options) => {
  const parsed = normalizeMoney(value);
  return toDbMoney(parsed, options);
};

export const normalizeRamo = (produtoRaw) => {
  if (!produtoRaw) return { produto: null, ramo: null };
  const normalized = normalizeText(produtoRaw);
  if (!normalized) return { produto: null, ramo: null };

  let ramo = 'OUTROS';
  if (['AUTO', 'AUTOMOVEL', 'VEICULO'].includes(normalized)) {
    ramo = 'AUTO';
  } else if (normalized.includes('VIDA')) {
    ramo = 'VIDA';
  } else if (normalized.includes('RESID')) {
    ramo = 'RESID';
  } else if (normalized.includes('EMP')) {
    ramo = 'EMP';
  } else if (normalized.includes('COND')) {
    ramo = 'COND';
  }

  return { produto: String(produtoRaw).trim(), ramo };
};
