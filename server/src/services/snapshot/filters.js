import { config } from '../../config.js';
import { buildStatusFilter } from '../../utils/status.js';

const withAlias = (alias, field) => (alias ? `${alias}.${field}` : field);

const applyStatusAlias = (filter, alias) => {
  if (!filter || !alias) return filter;
  return filter.replace(/\bstatus\b/g, `${alias}.status`);
};

/**
 * @param {Object} options
 * @param {string} options.monthRef
 * @param {boolean} [options.includeIncomplete]
 * @param {string | null} [options.vendorId]
 * @param {string | null} [options.ramo]
 * @param {string | null} [options.cutoffDate]
 * @param {string | null} [options.tableAlias]
 * @param {unknown[]} [options.params]
 * @returns {{ conditions: string[], params: unknown[] }}
 */
export const buildContractsFilters = ({
  monthRef,
  includeIncomplete = false,
  vendorId = null,
  ramo = null,
  cutoffDate = null,
  tableAlias = null,
  params = []
}) => {
  const values = Array.isArray(params) ? [...params] : [];
  const conditions = [];

  values.push(monthRef);
  conditions.push(`${withAlias(tableAlias, 'month_ref')} = $${values.length}`);
  conditions.push(`${withAlias(tableAlias, 'is_invalid')} = FALSE`);

  if (!includeIncomplete) {
    conditions.push(`${withAlias(tableAlias, 'is_incomplete')} = FALSE`);
  }

  const statusFilter = applyStatusAlias(buildStatusFilter(values, config.contractStatus), tableAlias);
  if (statusFilter) {
    conditions.push(statusFilter);
  }

  if (vendorId) {
    values.push(vendorId);
    conditions.push(`${withAlias(tableAlias, 'vendedor_id')} = $${values.length}`);
  }
  if (ramo) {
    values.push(ramo);
    conditions.push(`${withAlias(tableAlias, 'ramo')} = $${values.length}`);
  }
  if (cutoffDate) {
    values.push(cutoffDate);
    const field = withAlias(tableAlias, 'data_efetivacao');
    conditions.push(`(${field} IS NULL OR ${field} <= $${values.length})`);
  }

  return { conditions, params: values };
};

/**
 * @param {Object} options
 * @param {string} options.startMonth
 * @param {string} options.endMonth
 * @param {boolean} [options.includeIncomplete]
 * @param {string | null} [options.vendorId]
 * @param {string | null} [options.ramo]
 * @param {string | null} [options.cutoffDate]
 * @param {string | null} [options.tableAlias]
 * @param {unknown[]} [options.params]
 * @returns {{ conditions: string[], params: unknown[] }}
 */
export const buildContractsRangeFilters = ({
  startMonth,
  endMonth,
  includeIncomplete = false,
  vendorId = null,
  ramo = null,
  cutoffDate = null,
  tableAlias = null,
  params = []
}) => {
  const values = Array.isArray(params) ? [...params] : [];
  const conditions = [];

  values.push(startMonth);
  conditions.push(`${withAlias(tableAlias, 'month_ref')} >= $${values.length}`);
  values.push(endMonth);
  conditions.push(`${withAlias(tableAlias, 'month_ref')} <= $${values.length}`);
  conditions.push(`${withAlias(tableAlias, 'is_invalid')} = FALSE`);

  if (!includeIncomplete) {
    conditions.push(`${withAlias(tableAlias, 'is_incomplete')} = FALSE`);
  }

  const statusFilter = applyStatusAlias(buildStatusFilter(values, config.contractStatus), tableAlias);
  if (statusFilter) {
    conditions.push(statusFilter);
  }

  if (vendorId) {
    values.push(vendorId);
    conditions.push(`${withAlias(tableAlias, 'vendedor_id')} = $${values.length}`);
  }
  if (ramo) {
    values.push(ramo);
    conditions.push(`${withAlias(tableAlias, 'ramo')} = $${values.length}`);
  }
  if (cutoffDate) {
    values.push(cutoffDate);
    const field = withAlias(tableAlias, 'data_efetivacao');
    conditions.push(`(${field} IS NULL OR ${field} <= $${values.length})`);
  }

  return { conditions, params: values };
};
