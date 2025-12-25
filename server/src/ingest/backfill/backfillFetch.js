import { fetchZohoReport, streamZohoReport } from '../zohoClient.js';

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
 * @param {Object} [params.retryOptions]
 * @returns {Promise<Object[]>}
 */
export const fetchBackfillRecords = async ({ criteria, retryOptions } = {}) => {
  return fetchZohoReport({ criteria, retryOptions });
};

/**
 * @param {Object} params
 * @param {string} params.criteria
 * @param {Object} [params.retryOptions]
 */
export const streamBackfillRecords = ({ criteria, retryOptions } = {}) => {
  return streamZohoReport({ criteria, retryOptions });
};
