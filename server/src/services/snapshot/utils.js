import { formatMonthRef, startOfMonth } from '../../utils/date.js';

/**
 * @param {string} monthRef
 * @returns {number}
 */
export const monthRefToIndex = (monthRef) => {
  const [year, month] = monthRef.split('-').map(Number);
  return year * 12 + (month - 1);
};

/**
 * @param {string} startMonth
 * @param {string} endMonth
 * @returns {{start: string, end: string}}
 */
export const normalizeMonthRange = (startMonth, endMonth) => {
  if (monthRefToIndex(startMonth) <= monthRefToIndex(endMonth)) {
    return { start: startMonth, end: endMonth };
  }
  return { start: endMonth, end: startMonth };
};

/**
 * @param {string} startMonth
 * @param {string} endMonth
 * @returns {string[]}
 */
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

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export const compareMonthRefs = (a, b) => monthRefToIndex(a) - monthRefToIndex(b);

/**
 * @param {string | null} value
 * @param {string | null} min
 * @param {string | null} max
 * @returns {string | null}
 */
export const clampMonthRef = (value, min, max) => {
  if (!value) return value;
  let result = value;
  if (min && compareMonthRefs(result, min) < 0) result = min;
  if (max && compareMonthRefs(result, max) > 0) result = max;
  return result;
};

/**
 * @param {string} monthRef
 * @param {number} deltaMonths
 * @returns {string}
 */
export const shiftMonthRef = (monthRef, deltaMonths) => {
  const base = startOfMonth(monthRef);
  const shifted = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + deltaMonths, 1));
  return formatMonthRef(shifted);
};

/**
 * @param {Date} date
 * @param {number} deltaMonths
 * @returns {Date}
 */
export const shiftDateByMonths = (date, deltaMonths) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(year, month + deltaMonths, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
};
