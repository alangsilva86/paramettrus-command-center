const UNIT_SCALE = {
  reais: 1,
  centavos: 100
};

const normalizeUnit = (value, fallback) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'real' || normalized === 'reais') return 'reais';
  if (normalized === 'centavo' || normalized === 'centavos') return 'centavos';
  return fallback;
};

const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
};

const getScale = (unit) => UNIT_SCALE[normalizeUnit(unit, 'centavos')] || 100;

export const toReais = (value, unit = 'centavos') => {
  const number = normalizeNumber(value);
  if (number === null) return 0;
  return number / getScale(unit);
};

export const toReaisNullable = (value, unit = 'centavos') => {
  const number = normalizeNumber(value);
  if (number === null) return null;
  return number / getScale(unit);
};

export const toDbMoney = (value, { sourceUnit = 'reais', dbUnit = 'centavos' } = {}) => {
  const number = normalizeNumber(value);
  if (number === null) return null;
  const sourceScale = getScale(sourceUnit);
  const dbScale = getScale(dbUnit);
  const scaled = (number * dbScale) / sourceScale;
  if (dbScale === 1) {
    return Number(scaled.toFixed(2));
  }
  return Math.round(scaled);
};
