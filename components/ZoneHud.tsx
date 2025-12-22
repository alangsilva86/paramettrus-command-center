import React from 'react';
import { DashboardSnapshot } from '../types';
import WidgetCard from './WidgetCard';
import { Siren, TrendingUp, AlertOctagon } from 'lucide-react';

interface ZoneHudProps {
  data: DashboardSnapshot | null;
}

const ZoneHud: React.FC<ZoneHudProps> = ({ data }) => {
  if (!data) return <div className="animate-pulse h-full bg-param-card/50 rounded" />;

  const { kpis, renewals } = data;
  
  // Forecast Status Logic (Anti-Panic)
  const isForecastGood = kpis.forecast_pct_meta >= 1.0;
  const isForecastRisk = kpis.forecast_pct_meta < 0.90;
  let forecastColor = 'text-param-text';
  if(isForecastGood) forecastColor = 'text-param-success';
  else if(isForecastRisk) forecastColor = 'text-param-danger';
  else forecastColor = 'text-yellow-400';

  // Gauge Logic
  const pct = Math.min(kpis.pct_meta * 100, 100);
  const gaugeColor = pct >= 90 ? '#00C853' : pct >= 70 ? '#FFD600' : '#FF1744';
  const radius = 80;
  const circumference = radius * Math.PI;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-full">
      
      {/* Widget A: Velocímetro de Comissão */}
      <WidgetCard title="Comissão MTD (Realizado)" className="md:col-span-2">
        <div className="flex items-center justify-between">
          <div className="relative w-40 h-24 flex items-end justify-center overflow-hidden">
            <svg className="w-full h-full" viewBox="0 0 200 100">
              <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#333" strokeWidth="20" />
              <path 
                d="M 20 100 A 80 80 0 0 1 180 100" 
                fill="none" 
                stroke={gaugeColor} 
                strokeWidth="20"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute bottom-0 text-3xl font-bold text-white">
              {Math.round(pct)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-white tracking-tighter">
              R$ {kpis.comissao_mtd.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div className={`text-xs font-bold mt-2 flex items-center justify-end gap-1 ${forecastColor}`}>
              <TrendingUp className="w-3 h-3" />
              PROJEÇÃO: R$ {kpis.forecast_comissao.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[10px] text-gray-500">
               (Anti-Pânico Weighted Forecast)
            </div>
          </div>
        </div>
      </WidgetCard>

      {/* Widget B: O "Gap" Diário */}
      <WidgetCard title="Gap Diário">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-xs text-gray-400 mb-1">SUA META HOJE</div>
          <div className={`text-3xl font-black ${kpis.gap_diario > 0 ? 'text-param-primary' : 'text-param-success'}`}>
             {kpis.gap_diario > 0 
               ? `R$ ${kpis.gap_diario.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
               : 'LIVRE'}
          </div>
          <div className="text-[10px] text-gray-500 mt-2 text-center w-full border-t border-param-border pt-2">
            RITMO NECESSÁRIO
          </div>
        </div>
      </WidgetCard>

      {/* Widget C: Renovação TLP (Traffic Light Protocol) */}
      <WidgetCard title="Defesa (TLP)" alert={renewals.d7.count > 0 || renewals.d15.count > 0}>
        <div className="flex flex-col gap-2 justify-center h-full">
            
            {/* D-7 Alert */}
            <div className={`flex items-center justify-between p-2 rounded ${renewals.d7.count > 0 ? 'bg-param-danger/20 border border-param-danger' : 'bg-param-bg border border-gray-800'}`}>
                <div className="flex items-center gap-2">
                    <Siren className={`w-4 h-4 ${renewals.d7.count > 0 ? 'text-param-danger animate-pulse' : 'text-gray-600'}`} />
                    <span className="text-xs font-bold text-gray-300">CRÍTICO (D-7)</span>
                </div>
                <div className="text-right">
                    <div className="text-sm font-bold text-white">{renewals.d7.count}</div>
                    {renewals.d7.comissao_risco > 0 && (
                        <div className="text-[10px] text-param-danger">R$ {renewals.d7.comissao_risco.toLocaleString('pt-BR', { maximumFractionDigits:0 })}</div>
                    )}
                </div>
            </div>

            {/* D-15 Alert */}
            <div className={`flex items-center justify-between p-2 rounded ${renewals.d15.count > 0 ? 'bg-yellow-900/20 border border-yellow-700' : 'bg-param-bg border border-gray-800'}`}>
                <div className="flex items-center gap-2">
                    <AlertOctagon className={`w-4 h-4 ${renewals.d15.count > 0 ? 'text-yellow-500' : 'text-gray-600'}`} />
                    <span className="text-xs font-bold text-gray-300">ALERTA (D-15)</span>
                </div>
                <div className="text-right">
                    <div className="text-sm font-bold text-white">{renewals.d15.count}</div>
                </div>
            </div>

        </div>
      </WidgetCard>
    </div>
  );
};

export default ZoneHud;