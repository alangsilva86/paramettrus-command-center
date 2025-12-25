import { normalizeZohoRecord } from '../normalize.js';

/**
 * @param {Object} record
 * @returns {Object}
 */
export const normalizeBackfillRecord = (record) => normalizeZohoRecord(record);
