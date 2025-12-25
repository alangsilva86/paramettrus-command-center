import { isSnapshotVersionCompatible } from './constants.js';
import { toNumber } from './numbers.js';
import { fetchSnapshotCached } from './repository.js';

export const compareSnapshots = async ({ monthRef, scenarioId }) => {
  const base = await fetchSnapshotCached({ monthRef, scenarioId: null });
  const scenario = await fetchSnapshotCached({ monthRef, scenarioId });
  if (!base || !scenario) return null;
  if (!isSnapshotVersionCompatible(base) || !isSnapshotVersionCompatible(scenario)) return null;

  const deltaFields = [
    'comissao_mtd',
    'premio_mtd',
    'forecast_comissao',
    'gap_diario',
    'auto_share_comissao',
    'margem_media_pct',
    'ticket_medio',
    'pct_meta'
  ];
  const kpisDelta = {};
  deltaFields.forEach((field) => {
    kpisDelta[field] = toNumber(scenario.kpis?.[field]) - toNumber(base.kpis?.[field]);
  });

  const baseRanks = new Map((base.leaderboard || []).map((row, idx) => [row.vendedor_id, idx + 1]));
  const scenarioRanks = new Map(
    (scenario.leaderboard || []).map((row, idx) => [row.vendedor_id, idx + 1])
  );
  const vendors = new Set([...baseRanks.keys(), ...scenarioRanks.keys()]);
  const ranking = Array.from(vendors)
    .map((vendorId) => {
      const baseRank = baseRanks.get(vendorId) || null;
      const scenarioRank = scenarioRanks.get(vendorId) || null;
      const rankDelta =
        baseRank && scenarioRank
          ? baseRank - scenarioRank
          : baseRank
          ? -baseRank
          : scenarioRank
          ? scenarioRank
          : null;
      return {
        vendedor_id: vendorId,
        base_rank: baseRank,
        scenario_rank: scenarioRank,
        rank_delta: rankDelta
      };
    })
    .sort((a, b) => Math.abs(b.rank_delta || 0) - Math.abs(a.rank_delta || 0))
    .slice(0, 8);

  const baseMixMap = new Map((base.mix?.products || []).map((row) => [row.ramo, row.share_comissao]));
  const scenarioMixMap = new Map(
    (scenario.mix?.products || []).map((row) => [row.ramo, row.share_comissao])
  );
  const mixKeys = new Set([...baseMixMap.keys(), ...scenarioMixMap.keys()]);
  const mix = Array.from(mixKeys).map((ramo) => ({
    ramo,
    share_delta: toNumber(scenarioMixMap.get(ramo)) - toNumber(baseMixMap.get(ramo))
  }));

  return {
    base,
    scenario,
    delta: {
      kpis: kpisDelta,
      ranking,
      mix
    }
  };
};
