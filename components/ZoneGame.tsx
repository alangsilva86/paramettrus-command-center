import React from 'react';
import { LeaderboardEntry } from '../types';
import WidgetCard from './WidgetCard';
import { Trophy, Shield, Flame, Crosshair } from 'lucide-react';

interface ZoneGameProps {
  leaderboard: LeaderboardEntry[];
}

const ZoneGame: React.FC<ZoneGameProps> = ({ leaderboard }) => {
  const maxXP = leaderboard.length > 0 ? leaderboard[0].xp : 1;

  // Helper to render badges
  const renderBadge = (badge: string) => {
    switch(badge) {
      case 'COMBO': return (
        <span title="Combo Breaker: Auto + Vida">
          <Flame className="w-3 h-3 text-orange-500" />
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
      <WidgetCard title="XP Ledger (Oficial)" className="md:col-span-2 overflow-hidden">
        <div className="flex flex-col gap-3 overflow-y-auto pr-2 max-h-[250px] brutal-scroll">
          {leaderboard.map((rank, index) => {
            const isTop = index === 0;
            const widthPct = (rank.xp / maxXP) * 100;
            
            return (
              <div key={rank.vendedor_id} className="relative group">
                <div className="flex items-center justify-between text-sm mb-1 z-10 relative">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-bold w-4 ${isTop ? 'text-yellow-400' : 'text-gray-500'}`}>
                      {index + 1}
                    </span>
                    <span className="font-bold text-white uppercase">{rank.vendedor_id}</span>
                    {isTop && <Trophy className="w-3 h-3 text-yellow-400" />}
                    <div className="flex gap-1 ml-2">
                      {rank.badges.map(b => <span key={b}>{renderBadge(b)}</span>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                     <span className="text-[10px] text-gray-500 font-mono">
                       R$ {rank.comissao.toLocaleString('pt-BR', { maximumFractionDigits: 0})} COMM
                     </span>
                     <span className="font-bold text-param-accent">{Math.floor(rank.xp).toLocaleString()} XP</span>
                  </div>
                </div>
                
                {/* Progress Bar Background */}
                <div className="h-2 w-full bg-param-bg rounded-sm overflow-hidden border border-param-border relative">
                   {/* Ghost Bar for Target (Optional visual flair) */}
                   <div className="absolute top-0 left-0 h-full w-full bg-[#111] opacity-50" />
                   
                   {/* Actual Bar */}
                  <div 
                    className={`h-full ${isTop ? 'bg-gradient-to-r from-param-primary to-yellow-500' : 'bg-param-accent'}`} 
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {leaderboard.length === 0 && <div className="text-gray-500 text-center italic">Calculando Ledger...</div>}
        </div>
      </WidgetCard>

      {/* Widget E: Info tática */}
      <WidgetCard title="Regras de Combate (v2025.12)">
        <ul className="text-xs space-y-3 text-gray-400">
            <li className="flex justify-between border-b border-gray-800 pb-2">
                <span>Multiplicador VIDA</span>
                <span className="text-param-primary font-bold">2.0x</span>
            </li>
            <li className="flex justify-between border-b border-gray-800 pb-2">
                <span>Bonus Cross-Sell</span>
                <span className="text-param-accent font-bold">+500 XP</span>
            </li>
             <li className="flex justify-between border-b border-gray-800 pb-2">
                <span>Bonus Combo Breaker</span>
                <span className="text-orange-500 font-bold">+800 XP</span>
            </li>
            <li className="pt-2 text-[10px] text-gray-600 italic">
                *Renovação perdida trava XP de bônus do mês.
            </li>
        </ul>
      </WidgetCard>

    </div>
  );
};

export default ZoneGame;
