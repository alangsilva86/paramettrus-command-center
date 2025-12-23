const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const parseLocalizedNumber = (value: string) => {
  const normalized = value
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNumber = (value: number | string | null | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    return parseLocalizedNumber(value);
  }
  return 0;
};

export const formatCurrencyBRL = (value: number | string | null | undefined) => {
  return currencyFormatter.format(toNumber(value));
};

export const formatSignedCurrencyBRL = (value: number | string | null | undefined) => {
  const numeric = toNumber(value);
  const sign = numeric >= 0 ? '+' : '-';
  return `${sign} ${currencyFormatter.format(Math.abs(numeric))}`;
};
