import { formatMonthRef, startOfMonth } from './date.js';

export const monthRefToIndex = (monthRef) => {
  const [year, month] = monthRef.split('-').map(Number);
  return year * 12 + (month - 1);
};

export const normalizeMonthRange = (startMonth, endMonth) => {
  if (monthRefToIndex(startMonth) <= monthRefToIndex(endMonth)) {
    return { start: startMonth, end: endMonth };
  }
  return { start: endMonth, end: startMonth };
};

export const listMonthRefs = (startMonth, endMonth) => {
  const startIdx = monthRefToIndex(startMonth);
  const endIdx = monthRefToIndex(endMonth);
  const months = [];
  for (let idx = startIdx; idx <= endIdx; idx += 1) {
    const year = Math.floor(idx / 12);
    const month = String((idx % 12) + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
  }
  return months;
};

export const compareMonthRefs = (a, b) => monthRefToIndex(a) - monthRefToIndex(b);

export const clampMonthRef = (value, min, max) => {
  if (!value) return value;
  let result = value;
  if (min && compareMonthRefs(result, min) < 0) result = min;
  if (max && compareMonthRefs(result, max) > 0) result = max;
  return result;
};

export const shiftMonthRef = (monthRef, deltaMonths) => {
  const base = startOfMonth(monthRef);
  const shifted = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + deltaMonths, 1));
  return formatMonthRef(shifted);
};

export const shiftDateByMonths = (date, deltaMonths) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(year, month + deltaMonths, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
};

export const countMonthsInRange = (startMonth, endMonth) => {
  const normalized = normalizeMonthRange(startMonth, endMonth);
  const startIdx = monthRefToIndex(normalized.start);
  const endIdx = monthRefToIndex(normalized.end);
  return endIdx - startIdx + 1;
};
