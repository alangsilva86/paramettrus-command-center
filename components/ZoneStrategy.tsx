import React from 'react';
import { DashboardSnapshot, RadarProductBubble } from '../types';
import WidgetCard from './WidgetCard';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, Cell, ZAxis, ReferenceLine } from 'recharts';
import { formatCurrencyBRL } from '../utils/format';
import InfoTooltip from '../src/components/ui/InfoTooltip';

interface ZoneStrategyProps {
  data: DashboardSnapshot | null;
  crossSell: {
    totalCustomers: number;
    monoprodutoCount: number;
    multiProdutoCount: number;
    monoprodutoPct: number;
    autoVidaCount: number;
    autoSemVidaCount: number;
    autoSemVida: Array<{
      cpf_cnpj: string;
      segurado_nome: string;
      comissao_total: number;
      premio_total: number;
    }>;
  } | null;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as RadarProductBubble;
    return (
      <div className="bg-param-bg border border-param-border p-2 text-xs rounded shadow-xl z-50">
        <p className="font-bold text-white mb-1 uppercase">{data.ramo}</p>
        <p className="text-param-primary">Comissão: {formatCurrencyBRL(data.comissao_total)}</p>
        <p className="text-gray-400">Prêmio: {formatCurrencyBRL(data.premio_total)}</p>
        <p className="text-param-accent">Margem: {data.comissao_pct_avg.toFixed(2)}%</p>
      </div>
    );
  }
  return null;
};

const ZoneStrategy: React.FC<ZoneStrategyProps> = ({ data, crossSell }) => {
  if (!data) return null;

  const { radar, kpis } = data;
  const mix = data.mix || { products: [], insurers: [], matrix: [] };
  
  // Monoculture Risk
  const autoPct = Math.round(kpis.auto_share_comissao * 100);
  const isMonocultureRisk = autoPct > 60;

  // Formatting for Bubble Chart
  // We want Auto to be distinct color
  const formatShare = (value: number) => `${(value * 100).toFixed(0)}%`;
  const formatDelta = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  const deltaClass = (value: number) =>
    value > 0 ? 'text-param-success' : value < 0 ? 'text-param-danger' : 'text-gray-500';

  const matrixGroups = mix.matrix.reduce<Record<string, typeof mix.matrix>>((acc, item) => {
    if (!acc[item.quadrant]) acc[item.quadrant] = [];
    acc[item.quadrant].push(item);
    return acc;
  }, {});
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
      
      {/* Widget F: Radar Bubble Chart (Product Mix) */}
      <WidgetCard title="Radar de Mix (Estratégia)" className="lg:col-span-2">
        <div className="w-full h-[220px] min-h-[220px] min-w-[260px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={260} minHeight={220}>
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
                    fill={entry.ramo === 'AUTO' ? '#FF6B06' : '#F59E0B'}
                    fillOpacity={0.75}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="absolute top-4 right-4 flex gap-3">
             <div className="flex items-center gap-1">
                 <div className="w-2 h-2 rounded-full bg-param-primary"></div>
                 <span className="text-[10px] text-gray-500">AUTO</span>
             </div>
             <div className="flex items-center gap-1">
                 <div className="w-2 h-2 rounded-full bg-param-warning"></div>
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
          <div className="border-t border-param-border pt-4">
             <div className="flex justify-between text-[10px] text-gray-400 mb-1 uppercase">
                <span>Top 1 Seguradora</span>
                <span>{(radar.top_insurer_share * 100).toFixed(0)}%</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
                <div 
                    style={{ width: `${radar.top_insurer_share * 100}%` }} 
                    className={`h-full ${radar.top_insurer_share > 0.4 ? 'bg-param-warning' : 'bg-gray-500'}`}
                />
            </div>
          </div>

          <div className="text-[10px] text-gray-600 text-center italic mt-2">
             "Diversificar é sobreviver."
          </div>

        </div>
      </WidgetCard>

      {/* Widget H: Mix por Produto */}
      <WidgetCard title="Mix por Produto" className="lg:col-span-1">
        <div className="flex flex-col gap-2 text-xs text-gray-300">
          {mix.products.slice(0, 6).map((item) => (
            <div key={item.ramo} className="border-b border-param-border pb-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-white">{item.ramo}</span>
                <span className={`text-[10px] ${deltaClass(item.mom_share_delta)}`}>
                  {formatDelta(item.mom_share_delta)}
                </span>
              </div>
              <div className="text-[10px] text-gray-500">
                Share {formatShare(item.share_comissao)} · Risco {(item.risk_pct * 100).toFixed(0)}%
              </div>
            </div>
          ))}
          {mix.products.length === 0 && <div className="text-gray-600 italic">Sem dados de mix.</div>}
        </div>
      </WidgetCard>

      {/* Widget I: Mix por Seguradora */}
      <WidgetCard title="Mix por Seguradora" className="lg:col-span-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-300">
          {mix.insurers.map((item) => (
            <div key={item.seguradora} className="border-b border-param-border pb-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-white">{item.seguradora}</span>
                <span className={`text-[10px] ${deltaClass(item.mom_share_delta)}`}>
                  {formatDelta(item.mom_share_delta)}
                </span>
              </div>
              <div className="text-[10px] text-gray-500">
                Share {formatShare(item.share_comissao)} · Margem {item.margem_pct.toFixed(1)}%
              </div>
            </div>
          ))}
          {mix.insurers.length === 0 && <div className="text-gray-600 italic">Sem dados de seguradoras.</div>}
        </div>
      </WidgetCard>

      {/* Widget J: Matriz Margem x Volume x Risco */}
      <WidgetCard title="Matriz Margem x Volume" className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 text-[10px] text-gray-400">
          {[
            { key: 'HIGH_MARGIN_HIGH_VOLUME', label: 'Alta margem · Alto volume' },
            { key: 'HIGH_MARGIN_LOW_VOLUME', label: 'Alta margem · Baixo volume' },
            { key: 'LOW_MARGIN_HIGH_VOLUME', label: 'Baixa margem · Alto volume' },
            { key: 'LOW_MARGIN_LOW_VOLUME', label: 'Baixa margem · Baixo volume' }
          ].map((group) => (
            <div key={group.key} className="border border-param-border rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                {group.label}
              </div>
              <div className="flex flex-wrap gap-2">
                {(matrixGroups[group.key] || []).map((item) => (
                  <span
                    key={item.ramo}
                    className={`px-2 py-1 rounded-full border ${
                      item.risk_pct > 0.2 ? 'border-param-danger text-param-danger' : 'border-param-border text-gray-300'
                    }`}
                  >
                    {item.ramo}
                  </span>
                ))}
                {(matrixGroups[group.key] || []).length === 0 && (
                  <span className="text-gray-600 italic">Sem itens</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </WidgetCard>

      {/* Widget K: Cross-sell Radar (Auto sem Vida) */}
      <WidgetCard title="Cross-sell (Auto sem Vida)" className="lg:col-span-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-xs text-gray-400">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Funil</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Total clientes</span>
                <span className="text-white font-bold">{crossSell?.totalCustomers ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Monoproduto</span>
                <span className="text-white font-bold">{crossSell?.monoprodutoCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Multiproduto</span>
                <span className="text-param-success font-bold">{crossSell?.multiProdutoCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Auto + Vida</span>
                <span className="text-param-success font-bold">{crossSell?.autoVidaCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Auto sem Vida</span>
                <span className="text-param-danger font-bold">{crossSell?.autoSemVidaCount ?? 0}</span>
              </div>
              <div className="text-[10px] text-gray-600 pt-2 border-t border-param-border">
                Monoproduto {Math.round((crossSell?.monoprodutoPct || 0) * 100)}%
              </div>
            </div>
          </div>
          <div className="md:col-span-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              <span>Prioridade por Comissão Potencial</span>
              <InfoTooltip
                label=""
                description="Clientes Auto sem Vida com maior comissão total; foco em onde há mais peso financeiro."
                className="text-white/60"
              />
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2 brutal-scroll">
              {(crossSell?.autoSemVida || []).slice(0, 8).map((item) => (
                <div key={item.cpf_cnpj} className="flex justify-between items-center border-b border-param-border pb-1 text-xs">
                  <div>
                    <div className="text-white font-bold">{item.segurado_nome || item.cpf_cnpj}</div>
                    <div className="text-gray-500">{item.cpf_cnpj}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-param-accent font-bold">
                      {formatCurrencyBRL(item.comissao_total || 0)}
                    </div>
                    <div className="text-gray-500 text-[10px]">
                      Prêmio {formatCurrencyBRL(item.premio_total || 0)}
                    </div>
                  </div>
                </div>
              ))}
              {(crossSell?.autoSemVida || []).length === 0 && (
                <div className="text-gray-600 italic">Sem lista disponível</div>
              )}
            </div>
          </div>
        </div>
      </WidgetCard>
    </div>
  );
};

export default ZoneStrategy;
