const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const parseLocalizedNumber = (value: string) => {
  const trimmed = value.trim();
  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');
  if (hasDot && !hasComma) {
    const decimalMatch = trimmed.match(/^-?\d+\.\d{1,2}$/);
    if (decimalMatch) {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  const normalized = trimmed
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNumber = (value: number | string | null | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const trimmed = value.trim();
    const hasComma = trimmed.includes(',');
    const hasDot = trimmed.includes('.');
    if (hasDot && !hasComma) {
      const decimalMatch = trimmed.match(/^-?\d+\.\d{1,2}$/);
      if (decimalMatch) {
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return parseLocalizedNumber(trimmed);
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
