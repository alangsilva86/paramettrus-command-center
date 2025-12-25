import { endOfMonth, formatMonthRef, startOfMonth } from '../../utils/date.js';
import { shiftMonthRef } from '../../utils/monthRef.js';

/**
 * @typedef {Object} BackfillRange
 * @property {string} monthRef
 * @property {Date} start
 * @property {Date} end
 */

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
