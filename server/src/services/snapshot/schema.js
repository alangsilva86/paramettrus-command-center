import { SNAPSHOT_MONEY_UNIT, SNAPSHOT_VERSION } from './constants.js';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isString = (value) => typeof value === 'string';
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const requiredKpis = [
  'meta_comissao',
  'comissao_mtd',
  'premio_mtd',
  'ticket_medio',
  'margem_media_pct',
  'pct_meta',
  'forecast_comissao',
  'forecast_pct_meta',
  'gap_diario',
  'auto_share_comissao',
  'monoproduto_pct',
  'mom_comissao_pct',
  'yoy_comissao_pct',
  'mom_premio_pct',
  'yoy_premio_pct',
  'mom_margem_pct',
  'yoy_margem_pct',
  'mom_ticket_pct',
  'yoy_ticket_pct'
];

const hasRequiredNumberFields = (target, fields) =>
  isObject(target) && fields.every((field) => isNumber(target[field]));

const hasValidTrend = (series) =>
  Array.isArray(series) &&
  series.every((entry) =>
    isObject(entry) && isString(entry.date) && isNumber(entry.comissao) && isNumber(entry.premio)
  );

const hasValidRenewals = (renewals) =>
  isObject(renewals) &&
  ['d7', 'd15', 'd30'].every((key) =>
    isObject(renewals[key]) &&
    isNumber(renewals[key].count) &&
    isNumber(renewals[key].comissao_risco)
  );

const hasValidFilters = (filters) =>
  isObject(filters) && Array.isArray(filters.vendors) && Array.isArray(filters.ramos);

const hasValidCoverage = (coverage) =>
  isObject(coverage) &&
  isNumber(coverage.contracts_total) &&
  isNumber(coverage.contracts_valid) &&
  isNumber(coverage.contracts_invalid) &&
  isNumber(coverage.contracts_incomplete) &&
  isNumber(coverage.valid_pct) &&
  Array.isArray(coverage.sources) &&
  isString(coverage.ingestion_status) &&
  isString(coverage.confidence);

const hasValidProcessing = (processing) =>
  isObject(processing) && isNumber(processing.duration_ms) && isString(processing.generated_at);

const hasValidPeriod = (period) =>
  isObject(period) &&
  isString(period.start) &&
  isString(period.end) &&
  isNumber(period.months) &&
  isString(period.label) &&
  isObject(period.requested) &&
  isString(period.requested.start) &&
  isString(period.requested.end) &&
  typeof period.clamped === 'boolean';

/**
 * @param {Object} snapshot
 * @param {Object} [options]
 * @param {'monthly'|'period'} [options.mode]
 * @returns {Object}
 */
export const validateSnapshot = (snapshot, { mode = 'monthly' } = {}) => {
  const errors = [];

  if (!isObject(snapshot)) {
    errors.push('snapshot');
  }
  if (snapshot?.snapshot_version !== SNAPSHOT_VERSION) {
    errors.push('snapshot_version');
  }
  if (snapshot?.money_unit !== SNAPSHOT_MONEY_UNIT) {
    errors.push('money_unit');
  }
  if (!hasValidProcessing(snapshot?.processing)) {
    errors.push('processing');
  }
  if (!hasRequiredNumberFields(snapshot?.kpis, requiredKpis)) {
    errors.push('kpis');
  }
  if (!hasValidTrend(snapshot?.trend_daily)) {
    errors.push('trend_daily');
  }
  if (!hasValidRenewals(snapshot?.renewals)) {
    errors.push('renewals');
  }
  if (!Array.isArray(snapshot?.leaderboard)) {
    errors.push('leaderboard');
  }
  if (!Array.isArray(snapshot?.vendor_stats)) {
    errors.push('vendor_stats');
  }
  if (!isObject(snapshot?.radar)) {
    errors.push('radar');
  }
  if (!isObject(snapshot?.mix)) {
    errors.push('mix');
  }
  if (!hasValidFilters(snapshot?.filters)) {
    errors.push('filters');
  }
  if (!hasValidCoverage(snapshot?.data_coverage)) {
    errors.push('data_coverage');
  }
  if (mode === 'period' && !hasValidPeriod(snapshot?.period)) {
    errors.push('period');
  }

  if (errors.length > 0) {
    throw new Error(`Snapshot schema invalid: ${errors.join(', ')}`);
  }

  return snapshot;
};
