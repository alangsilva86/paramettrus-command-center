import React, { useEffect, useMemo, useState } from 'react';
import { LeaderboardEntry, VendorStat } from '../types';
import WidgetCard from './WidgetCard';
import { Trophy, Shield, Flame, Crosshair } from 'lucide-react';
import { formatCurrencyBRL } from '../utils/format';

interface ZoneGameProps {
  leaderboard: LeaderboardEntry[];
  vendorStats: VendorStat[];
}

const ZoneGame: React.FC<ZoneGameProps> = ({ leaderboard, vendorStats }) => {
  const [metric, setMetric] = useState<'xp' | 'comissao' | 'growth'>('xp');
  const [activeVendor, setActiveVendor] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const badgesMap = useMemo(() => {
    return new Map(leaderboard.map((row) => [row.vendedor_id, row.badges || []]));
  }, [leaderboard]);

  const stats = useMemo(() => {
    if (vendorStats.length > 0) return vendorStats;
    return leaderboard.map((row) => ({
      vendedor_id: row.vendedor_id,
      xp: row.xp,
      comissao: row.comissao,
      premio: 0,
      sales_count: row.sales_count,
      growth_mom_pct: 0,
      gap_comissao: 0,
      gap_diario: 0,
      top_opportunities: []
    }));
  }, [vendorStats, leaderboard]);

  const sortedStats = useMemo(() => {
    const copied = [...stats];
    copied.sort((a, b) => {
      if (metric === 'growth') return (b.growth_mom_pct || 0) - (a.growth_mom_pct || 0);
      if (metric === 'comissao') return (b.comissao || 0) - (a.comissao || 0);
      return (b.xp || 0) - (a.xp || 0);
    });
    return copied;
  }, [stats, metric]);

  const maxValue = useMemo(() => {
    if (sortedStats.length === 0) return 1;
    if (metric === 'growth') {
      return Math.max(1, ...sortedStats.map((row) => Math.abs(row.growth_mom_pct || 0)));
    }
    if (metric === 'comissao') return Math.max(1, ...sortedStats.map((row) => row.comissao || 0));
    return Math.max(1, ...sortedStats.map((row) => row.xp || 0));
  }, [sortedStats, metric]);

  const visibleStats = useMemo(() => (showAll ? sortedStats : sortedStats.slice(0, 8)), [sortedStats, showAll]);
  const activeVendorId = activeVendor || sortedStats[0]?.vendedor_id || null;
  const activeStats = sortedStats.find((row) => row.vendedor_id === activeVendorId) || null;

  useEffect(() => {
    if (!sortedStats.length) {
      setActiveVendor(null);
      return;
    }
    if (!activeVendor || !sortedStats.find((row) => row.vendedor_id === activeVendor)) {
      setActiveVendor(sortedStats[0].vendedor_id);
    }
  }, [sortedStats, activeVendor]);

  // Helper to render badges
  const renderBadge = (badge: string) => {
    switch(badge) {
      case 'COMBO': return (
        <span title="Combo Breaker: Auto + Vida">
          <Flame className="w-3 h-3 text-param-warning" />
        </span>
      );
      case 'HUNTER': return (
        <span title="Cross-sell Hunter">
          <Crosshair className="w-3 h-3 text-param-accent" />
        </span>
      );
      case 'DEFENSOR': return (
        <span title="Renovação Impecável">
          <Shield className="w-3 h-3 text-param-success" />
        </span>
      );
      default: return null;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
      
      {/* Widget D: XP Ledger Leaderboard */}
      <WidgetCard
        title="Leaderboard de Performance"
        className="md:col-span-2 overflow-hidden"
        action={
          <div className="flex gap-2 text-[10px]">
            {[
              { key: 'xp', label: 'XP' },
              { key: 'comissao', label: 'Comissão' },
              { key: 'growth', label: 'Crescimento' }
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setMetric(option.key as typeof metric)}
                className={`px-3 py-1.5 rounded-[10px] border uppercase tracking-widest ${
                  metric === option.key
                    ? 'border-param-primary text-param-primary'
                    : 'border-param-border text-gray-500 hover:border-param-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-col gap-3 overflow-y-auto pr-2 max-h-[250px] brutal-scroll">
          {visibleStats.map((rank, index) => {
            const isTop = index === 0;
            const metricValue =
              metric === 'growth'
                ? rank.growth_mom_pct || 0
                : metric === 'comissao'
                ? rank.comissao || 0
                : rank.xp || 0;
            const widthPct = Math.abs(metricValue) / maxValue * 100;
            const isNegativeGrowth = metric === 'growth' && metricValue < 0;
            
            return (
              <button
                key={rank.vendedor_id}
                type="button"
                onClick={() => setActiveVendor(rank.vendedor_id)}
                className="relative group text-left"
              >
                <div className="flex items-center justify-between text-sm mb-1 z-10 relative">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-bold w-4 ${isTop ? 'text-param-warning' : 'text-gray-500'}`}>
                      {index + 1}
                    </span>
                    <span className="font-bold text-white uppercase">{rank.vendedor_id}</span>
                    {isTop && <Trophy className="w-3 h-3 text-param-warning" />}
                    <div className="flex gap-1 ml-2">
                      {(badgesMap.get(rank.vendedor_id) || []).map((badge) => (
                        <span key={badge}>{renderBadge(badge)}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                     <span className="text-[10px] text-gray-500 font-mono">
                       {formatCurrencyBRL(rank.comissao || 0)} COMM
                     </span>
                     <span className="font-bold text-param-accent">
                       {metric === 'growth'
                         ? `${(metricValue * 100).toFixed(1)}%`
                         : metric === 'comissao'
                         ? formatCurrencyBRL(metricValue)
                         : `${Math.floor(metricValue).toLocaleString()} XP`}
                     </span>
                  </div>
                </div>
                
                {/* Progress Bar Background */}
                <div className="h-2 w-full bg-param-bg rounded-full overflow-hidden border border-param-border relative">
                   {/* Ghost Bar for Target (Optional visual flair) */}
                   <div className="absolute top-0 left-0 h-full w-full bg-[#111] opacity-50" />
                   
                   {/* Actual Bar */}
                  <div
                    className={`h-full ${
                      isNegativeGrowth
                        ? 'bg-param-danger'
                        : isTop
                        ? 'bg-param-primary'
                        : 'bg-param-accent'
                    }`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </button>
            );
          })}
          {sortedStats.length === 0 && <div className="text-gray-500 text-center italic">Calculando Ledger...</div>}
        </div>
        {sortedStats.length > 8 && (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="mt-3 text-[10px] uppercase tracking-widest text-white/60 hover:text-white"
          >
            {showAll ? 'Mostrar top 8' : 'Ver cauda longa'}
          </button>
        )}
      </WidgetCard>

      {/* Widget E: Foco do Vendedor */}
      <WidgetCard title="Foco do Vendedor">
        {activeStats ? (
          <div className="flex flex-col gap-3 text-xs text-gray-300">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500">Vendedor</div>
              <div className="text-xl font-bold text-white">{activeStats.vendedor_id}</div>
              <div className={`text-[10px] ${activeStats.growth_mom_pct >= 0 ? 'text-param-success' : 'text-param-danger'}`}>
                Crescimento MoM {(activeStats.growth_mom_pct * 100).toFixed(1)}%
              </div>
            </div>
            <div className="border-t border-param-border pt-3">
              <div className="text-[10px] uppercase tracking-widest text-gray-500">Gap vs Mês Anterior</div>
              <div className="text-lg font-bold text-param-primary">
                {formatCurrencyBRL(activeStats.gap_comissao)}
              </div>
              <div className="text-[10px] text-gray-500">
                Gap diário {formatCurrencyBRL(activeStats.gap_diario)}
              </div>
            </div>
            <div className="border-t border-param-border pt-3">
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Top Oportunidades</div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2 brutal-scroll">
                {activeStats.top_opportunities.map((item) => (
                  <div key={item.contract_id} className="border-b border-param-border pb-1">
                    <div className="text-white font-bold">{item.segurado_nome || item.contract_id}</div>
                    <div className="text-[10px] text-gray-500">
                      D-{item.days_to_end} · {item.stage || 'SEM_ACAO'} · Impacto {formatCurrencyBRL(item.impact_score || 0)}
                    </div>
                  </div>
                ))}
                {activeStats.top_opportunities.length === 0 && (
                  <div className="text-gray-600 italic">Sem oportunidades críticas</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-gray-600 italic">Sem dados para vendedor.</div>
        )}
      </WidgetCard>

    </div>
  );
};

export default ZoneGame;
