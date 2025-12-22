import React from 'react';
import { DashboardSnapshot, RadarProductBubble } from '../types';
import WidgetCard from './WidgetCard';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, Cell, ZAxis, ReferenceLine } from 'recharts';

interface ZoneStrategyProps {
  data: DashboardSnapshot | null;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as RadarProductBubble;
    return (
      <div className="bg-param-bg border border-param-border p-2 text-xs rounded shadow-xl z-50">
        <p className="font-bold text-white mb-1 uppercase">{data.ramo}</p>
        <p className="text-param-primary">Comissão: R$ {data.comissao_total.toLocaleString()}</p>
        <p className="text-gray-400">Prêmio: R$ {data.premio_total.toLocaleString()}</p>
        <p className="text-param-accent">Margem: {data.comissao_pct_avg.toFixed(2)}%</p>
      </div>
    );
  }
  return null;
};

const ZoneStrategy: React.FC<ZoneStrategyProps> = ({ data }) => {
  if (!data) return null;

  const { radar, kpis } = data;
  
  // Monoculture Risk
  const autoPct = Math.round(kpis.auto_share_comissao * 100);
  const otherPct = 100 - autoPct;
  const isMonocultureRisk = autoPct > 60;

  // Formatting for Bubble Chart
  // We want Auto to be distinct color
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
      
      {/* Widget F: Radar Bubble Chart (Product Mix) */}
      <WidgetCard title="Radar de Mix (Estratégia)" className="md:col-span-2">
        <div className="w-full h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
              <XAxis 
                type="number" 
                dataKey="comissao_total" 
                name="Comissão" 
                stroke="#444" 
                fontSize={10}
                tickFormatter={(val) => `R$${val/1000}k`}
              />
              <YAxis 
                type="number" 
                dataKey="comissao_pct_avg" 
                name="Margem" 
                unit="%" 
                stroke="#444" 
                fontSize={10} 
                domain={[0, 45]}
              />
              <ZAxis 
                type="number" 
                dataKey="premio_total" 
                range={[100, 1000]} // Controls bubble size
                name="Prêmio" 
              />
              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <ReferenceLine y={15} stroke="#333" strokeDasharray="3 3" label={{ value: 'Margem Min', fill: '#444', fontSize: 10 }} />
              
              <Scatter name="Produtos" data={radar.bubble_products}>
                {radar.bubble_products.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.ramo === 'AUTO' ? '#5A4BE3' : '#FF6B06'} 
                    fillOpacity={0.8}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="absolute top-4 right-4 flex gap-3">
             <div className="flex items-center gap-1">
                 <div className="w-2 h-2 rounded-full bg-param-accent"></div>
                 <span className="text-[10px] text-gray-500">AUTO</span>
             </div>
             <div className="flex items-center gap-1">
                 <div className="w-2 h-2 rounded-full bg-param-primary"></div>
                 <span className="text-[10px] text-gray-500">OUTROS</span>
             </div>
        </div>
      </WidgetCard>

      {/* Widget G: Monoculture & Pareto */}
      <WidgetCard title="Risco de Carteira" alert={isMonocultureRisk}>
        <div className="flex flex-col justify-center h-full gap-4">
          
          {/* Monoculture Bar */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-1 uppercase">
                <span>Dependência Auto</span>
                <span>{autoPct}%</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
                <div 
                    style={{ width: `${autoPct}%` }} 
                    className={`h-full ${isMonocultureRisk ? 'bg-param-danger' : 'bg-param-success'}`}
                />
            </div>
            {isMonocultureRisk && <div className="text-[10px] text-param-danger mt-1 font-bold animate-pulse">ALERTA DE CONCENTRAÇÃO</div>}
          </div>

          {/* Pareto (Simplified for UI) */}
          <div className="border-t border-gray-800 pt-4">
             <div className="flex justify-between text-[10px] text-gray-400 mb-1 uppercase">
                <span>Top 1 Seguradora</span>
                <span>{(radar.top_insurer_share * 100).toFixed(0)}%</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
                <div 
                    style={{ width: `${radar.top_insurer_share * 100}%` }} 
                    className={`h-full ${radar.top_insurer_share > 0.4 ? 'bg-yellow-500' : 'bg-gray-500'}`}
                />
            </div>
          </div>

          <div className="text-[10px] text-gray-600 text-center italic mt-2">
             "Diversificar é sobreviver."
          </div>

        </div>
      </WidgetCard>
    </div>
  );
};

export default ZoneStrategy;