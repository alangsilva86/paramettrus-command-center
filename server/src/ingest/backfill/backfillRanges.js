import { endOfMonth, formatMonthRef, startOfMonth } from '../../utils/date.js';

/**
 * @typedef {Object} BackfillRange
 * @property {string} monthRef
 * @property {Date} start
 * @property {Date} end
 */

/**
 * @param {string} monthRef
 * @param {number} deltaMonths
 * @returns {string}
 */
export const shiftMonthRef = (monthRef, deltaMonths) => {
  const [year, month] = monthRef.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return formatMonthRef(shifted);
};

/**
 * @param {Date} start
 * @param {Date} end
 * @returns {BackfillRange[]}
 */
export const buildBackfillRanges = (start, end) => {
  const ranges = [];
  const startMonth = formatMonthRef(start);
  const endMonth = formatMonthRef(end);
  let cursor = startMonth;
  while (cursor <= endMonth) {
    const rangeStart = cursor === startMonth ? start : startOfMonth(cursor);
    const rangeEnd = cursor === endMonth ? end : endOfMonth(cursor);
    ranges.push({ monthRef: cursor, start: rangeStart, end: rangeEnd });
    cursor = shiftMonthRef(cursor, 1);
  }
  return ranges;
};
