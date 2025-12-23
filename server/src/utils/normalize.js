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
  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
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
