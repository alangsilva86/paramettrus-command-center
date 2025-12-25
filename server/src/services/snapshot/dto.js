import { SNAPSHOT_MONEY_UNIT, SNAPSHOT_VERSION } from './constants.js';

export const buildMonthlySnapshotDto = ({
  monthRef,
  processing,
  dataCoverage,
  filterOptions,
  kpis,
  trendDaily,
  renewals,
  leaderboard,
  vendorStats,
  radar,
  mix
}) => ({
  month: monthRef,
  snapshot_version: SNAPSHOT_VERSION,
  money_unit: SNAPSHOT_MONEY_UNIT,
  processing,
  data_coverage: dataCoverage,
  filters: filterOptions,
  kpis,
  trend_daily: trendDaily,
  renewals,
  leaderboard,
  vendor_stats: vendorStats,
  radar,
  mix
});

export const buildPeriodSnapshotDto = ({
  monthRef,
  processing,
  period,
  dataCoverage,
  filterOptions,
  kpis,
  trendDaily,
  renewals,
  leaderboard,
  vendorStats,
  radar,
  mix
}) => ({
  month: monthRef,
  snapshot_version: SNAPSHOT_VERSION,
  money_unit: SNAPSHOT_MONEY_UNIT,
  processing,
  period,
  data_coverage: dataCoverage,
  filters: filterOptions,
  kpis,
  trend_daily: trendDaily,
  renewals,
  leaderboard,
  vendor_stats: vendorStats,
  radar,
  mix
});
