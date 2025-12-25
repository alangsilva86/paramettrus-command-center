import { fetchZohoReport, withRetry } from '../zohoClient.js';

/**
 * @param {string} field
 * @param {string} start
 * @param {string} end
 * @returns {string}
 */
export const buildBackfillCriteria = (field, start, end) => {
  return `(${field} >= "${start}" && ${field} <= "${end}")`;
};

/**
 * @param {Object} params
 * @param {string} params.criteria
 * @returns {Promise<Object[]>}
 */
export const fetchBackfillRecords = async ({ criteria }) => {
  return withRetry(
    () => fetchZohoReport({ criteria }),
    3,
    (error) => error?.code !== 'ZOHO_AUTH_401'
  );
};
