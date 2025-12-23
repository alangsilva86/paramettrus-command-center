import React from 'react';
import { DashboardSnapshot } from '../types';
import WidgetCard from './WidgetCard';
import { Siren, TrendingUp, AlertOctagon, Clock } from 'lucide-react';
import { formatCurrencyBRL } from '../utils/format';

interface ZoneHudProps {
  data: DashboardSnapshot | null;
  renewalsD5: Array<{
    contract_id: string;
    segurado_nome: string;
    vendedor_id: string;
    termino: string;
    comissao_valor: number;
    days_to_end: number;
    stage?: string;
    impact_score?: number;
    renewal_probability?: number;
  }>;
  renewalsD15: Array<{
    contract_id: string;
    segurado_nome: string;
    vendedor_id: string;
    termino: string;
    comissao_valor: number;
    days_to_end: number;
    stage?: string;
    impact_score?: number;
    renewal_probability?: number;
  }>;
  renewalsD30: Array<{
    contract_id: string;
    segurado_nome: string;
    vendedor_id: string;
    termino: string;
    comissao_valor: number;
    days_to_end: number;
    stage?: string;
    impact_score?: number;
    renewal_probability?: number;
  }>;
}

const ZoneHud: React.FC<ZoneHudProps> = ({ data, renewalsD5, renewalsD15, renewalsD30 }) => {
  if (!data) return <div className="animate-pulse h-full bg-param-card/50 rounded" />;

  const { kpis } = data;
  const renewals = data.renewals || {
    d7: { count: 0, comissao_risco: 0 },
    d15: { count: 0, comissao_risco: 0 },
    d30: { count: 0, comissao_risco: 0 }
  };
  const dataCoverage = data.data_coverage || {
    contracts_total: 0,
    contracts_valid: 0,
    contracts_invalid: 0,
    contracts_incomplete: 0,
    valid_pct: 0,
    sources: [],
    last_ingestion_at: null,
    ingestion_status: 'UNKNOWN',
    confidence: 'low' as const
  };
  const trendDaily = data.trend_daily || [];
  const zohoBase = import.meta.env.VITE_ZOHO_CONTRACT_URL || '';

  const premioMtd = Number(kpis.premio_mtd || 0);
  const margemMedia = Number(kpis.margem_media_pct || 0);
  const ticketMedio = Number(kpis.ticket_medio || 0);
  const momPremio = Number(kpis.mom_premio_pct || 0);
  const yoyPremio = Number(kpis.yoy_premio_pct || 0);
  const momMargem = Number(kpis.mom_margem_pct || 0);
  const yoyMargem = Number(kpis.yoy_margem_pct || 0);
  const momTicket = Number(kpis.mom_ticket_pct || 0);
  const yoyTicket = Number(kpis.yoy_ticket_pct || 0);
  const momComissao = Number(kpis.mom_comissao_pct || 0);
  const yoyComissao = Number(kpis.yoy_comissao_pct || 0);

  const trendValues = trendDaily.map((item) => item.comissao);
  const renderSparkline = () => {
    if (trendValues.length === 0) {
      return <div className="text-[10px] text-gray-600 italic">Sem tendência diária</div>;
    }
    const width = 140;
    const height = 40;
    const max = Math.max(...trendValues);
    const min = Math.min(...trendValues);
    const range = max - min || 1;
    const points = trendValues
      .map((value, index) => {
        const x = (index / Math.max(1, trendValues.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
      })
      .join(' ');
    return (
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke="#0B7F16"
          strokeWidth="2"
          points={points}
        />
      </svg>
    );
  };

  const formatDeltaPct = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  const deltaClass = (value: number) =>
    value > 0 ? 'text-param-success' : value < 0 ? 'text-param-danger' : 'text-gray-500';

  const confidenceTone =
    dataCoverage.confidence === 'high'
      ? 'text-param-success'
      : dataCoverage.confidence === 'medium'
      ? 'text-param-warning'
      : 'text-param-danger';
  const confidenceBg =
    dataCoverage.confidence === 'high'
      ? 'bg-param-success'
      : dataCoverage.confidence === 'medium'
      ? 'bg-param-warning'
      : 'bg-param-danger';

  const renderRenewalItem = (item: ZoneHudProps['renewalsD5'][number], accentClass: string) => {
    const impactValue = item.impact_score ?? item.comissao_valor ?? 0;
    const probabilityLabel =
      item.renewal_probability !== undefined ? `${Math.round(item.renewal_probability * 100)}%` : null;
    return (
      <div key={item.contract_id} className="flex justify-between items-center border-b border-param-border pb-1">
        <div>
          <div className="text-white font-bold">
            {zohoBase ? (
              <a href={`${zohoBase}${item.contract_id}`} target="_blank" rel="noreferrer">
                {item.segurado_nome || item.contract_id}
              </a>
            ) : (
              item.segurado_nome || item.contract_id
            )}
          </div>
          <div className="text-gray-500">
            {item.vendedor_id} · D-{item.days_to_end} · {item.stage || 'SEM_ACAO'}
          </div>
          <div className="text-[10px] text-gray-600">
            Impacto {formatCurrencyBRL(impactValue)}
            {probabilityLabel ? ` · Conf. ${probabilityLabel}` : ''}
          </div>
        </div>
        <div className={`${accentClass} font-bold`}>
          {formatCurrencyBRL(item.comissao_valor || 0)}
        </div>
      </div>
    );
  };
  
  // Forecast Status Logic (Anti-Panic)
  const isForecastGood = kpis.forecast_pct_meta >= 1.0;
  const isForecastRisk = kpis.forecast_pct_meta < 0.90;
  let forecastColor = 'text-param-text';
  if(isForecastGood) forecastColor = 'text-param-success';
  else if(isForecastRisk) forecastColor = 'text-param-danger';
  else forecastColor = 'text-param-warning';

  // Gauge Logic
  const pct = Math.min(kpis.pct_meta * 100, 100);
  const gaugeColor = pct >= 90 ? '#0B7F16' : pct >= 70 ? '#F59E0B' : '#B91C1C';
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
              {formatCurrencyBRL(kpis.comissao_mtd)}
            </div>
            <div className={`text-xs font-bold mt-2 flex items-center justify-end gap-1 ${forecastColor}`}>
              <TrendingUp className="w-3 h-3" />
              PROJEÇÃO: {formatCurrencyBRL(kpis.forecast_comissao)}
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
               ? formatCurrencyBRL(kpis.gap_diario)
               : 'LIVRE'}
          </div>
          <div className="text-[10px] text-gray-500 mt-2 text-center w-full border-t border-param-border pt-2">
            RITMO NECESSÁRIO
          </div>
        </div>
      </WidgetCard>

      {/* Widget C: Cobertura de Dados */}
      <WidgetCard title="Cobertura de Dados">
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Válidos</span>
            <span className={`font-bold ${confidenceTone}`}>
              {(dataCoverage.valid_pct * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
            <div
              style={{ width: `${Math.min(100, dataCoverage.valid_pct * 100)}%` }}
              className={`h-full ${confidenceBg}`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>Total: {dataCoverage.contracts_total}</span>
            <span>Inválidos: {dataCoverage.contracts_invalid}</span>
          </div>
          <div className="text-[10px] text-gray-600">
            Fontes: {dataCoverage.sources.map((source) => `${source.source}:${source.count}`).join(' · ') || 'N/D'}
          </div>
          <div className={`text-[10px] uppercase tracking-widest ${confidenceTone}`}>
            Confiança: {dataCoverage.confidence}
          </div>
          <div className="text-[10px] text-gray-600">
            Status: {dataCoverage.ingestion_status || 'UNKNOWN'}
          </div>
          <div className="text-[10px] text-gray-600">
            Última ingestão: {dataCoverage.last_ingestion_at ? new Date(dataCoverage.last_ingestion_at).toLocaleString('pt-BR') : '—'}
          </div>
        </div>
      </WidgetCard>

      {/* Widget D: Resumo Executivo */}
      <WidgetCard title="Resumo Executivo" className="md:col-span-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Prêmio MTD</div>
            <div className="text-xl font-bold text-white">
              {formatCurrencyBRL(premioMtd)}
            </div>
            <div className={`text-[10px] ${deltaClass(momPremio)}`}>
              MoM {formatDeltaPct(momPremio)}
            </div>
            <div className={`text-[10px] ${deltaClass(yoyPremio)}`}>
              YoY {formatDeltaPct(yoyPremio)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Margem Média</div>
            <div className="text-xl font-bold text-white">{margemMedia.toFixed(1)}%</div>
            <div className={`text-[10px] ${deltaClass(momMargem)}`}>
              MoM {formatDeltaPct(momMargem)}
            </div>
            <div className={`text-[10px] ${deltaClass(yoyMargem)}`}>
              YoY {formatDeltaPct(yoyMargem)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Ticket Médio</div>
            <div className="text-xl font-bold text-white">
              {formatCurrencyBRL(ticketMedio)}
            </div>
            <div className={`text-[10px] ${deltaClass(momTicket)}`}>
              MoM {formatDeltaPct(momTicket)}
            </div>
            <div className={`text-[10px] ${deltaClass(yoyTicket)}`}>
              YoY {formatDeltaPct(yoyTicket)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Comissão MTD</div>
            <div className="text-xl font-bold text-white">
              {formatCurrencyBRL(kpis.comissao_mtd)}
            </div>
            <div className={`text-[10px] ${deltaClass(momComissao)}`}>
              MoM {formatDeltaPct(momComissao)}
            </div>
            <div className={`text-[10px] ${deltaClass(yoyComissao)}`}>
              YoY {formatDeltaPct(yoyComissao)}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-param-border flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Trend diária (comissão)</div>
            <div className="text-[10px] text-gray-600">Últimos 14 dias</div>
          </div>
          {renderSparkline()}
        </div>
      </WidgetCard>

      {/* Widget E: Renovação TLP (Traffic Light Protocol) */}
      <WidgetCard
        title="Defesa (TLP)"
        alert={renewals.d7.count > 0 || renewals.d15.count > 0 || renewals.d30.count > 0}
        className="md:col-span-4"
      >
        <div className="flex flex-col gap-2 justify-center h-full">
            
            {/* D-7 Alert */}
            <div className={`flex items-center justify-between p-2 rounded-[10px] ${renewals.d7.count > 0 ? 'bg-param-danger/20 border border-param-danger' : 'bg-param-bg border border-param-border'}`}>
                <div className="flex items-center gap-2">
                    <Siren className={`w-4 h-4 ${renewals.d7.count > 0 ? 'text-param-danger animate-pulse' : 'text-gray-600'}`} />
                    <span className="text-xs font-bold text-gray-300">CRÍTICO (D-7)</span>
                </div>
                <div className="text-right">
                    <div className="text-sm font-bold text-white">{renewals.d7.count}</div>
                    {renewals.d7.comissao_risco > 0 && (
                        <div className="text-[10px] text-param-danger">{formatCurrencyBRL(renewals.d7.comissao_risco)}</div>
                    )}
                </div>
            </div>

            {/* D-15 Alert */}
            <div className={`flex items-center justify-between p-2 rounded-[10px] ${renewals.d15.count > 0 ? 'bg-param-warning/15 border border-param-warning/40' : 'bg-param-bg border border-param-border'}`}>
                <div className="flex items-center gap-2">
                    <AlertOctagon className={`w-4 h-4 ${renewals.d15.count > 0 ? 'text-param-warning' : 'text-gray-600'}`} />
                    <span className="text-xs font-bold text-gray-300">ALERTA (D-15)</span>
                </div>
                <div className="text-right">
                    <div className="text-sm font-bold text-white">{renewals.d15.count}</div>
                    {renewals.d15.comissao_risco > 0 && (
                        <div className="text-[10px] text-param-warning">{formatCurrencyBRL(renewals.d15.comissao_risco)}</div>
                    )}
                </div>
            </div>

            {/* D-30 Alert */}
            <div className={`flex items-center justify-between p-2 rounded-[10px] ${renewals.d30.count > 0 ? 'bg-param-accent/15 border border-param-accent/40' : 'bg-param-bg border border-param-border'}`}>
                <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${renewals.d30.count > 0 ? 'text-param-accent' : 'text-gray-600'}`} />
                    <span className="text-xs font-bold text-gray-300">OBSERVAÇÃO (D-30)</span>
                </div>
                <div className="text-right">
                    <div className="text-sm font-bold text-white">{renewals.d30.count}</div>
                    {renewals.d30.comissao_risco > 0 && (
                        <div className="text-[10px] text-param-accent">{formatCurrencyBRL(renewals.d30.comissao_risco)}</div>
                    )}
                </div>
            </div>

        </div>
      </WidgetCard>

      {/* Widget F: Lista Priorizada (D-5/D-15/D-30) */}
      <WidgetCard title="Renovações Prioritárias" className="md:col-span-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-param-danger mb-2">D-5</div>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-2 brutal-scroll">
              {renewalsD5.slice(0, 6).map((item) => renderRenewalItem(item, 'text-param-danger'))}
              {renewalsD5.length === 0 && <div className="text-gray-600 italic">Sem críticos D-5</div>}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-param-warning mb-2">D-15</div>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-2 brutal-scroll">
              {renewalsD15.slice(0, 6).map((item) => renderRenewalItem(item, 'text-param-warning'))}
              {renewalsD15.length === 0 && <div className="text-gray-600 italic">Sem alertas D-15</div>}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-param-accent mb-2">D-30</div>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-2 brutal-scroll">
              {renewalsD30.slice(0, 6).map((item) => renderRenewalItem(item, 'text-param-accent'))}
              {renewalsD30.length === 0 && <div className="text-gray-600 italic">Sem pré-alertas D-30</div>}
            </div>
          </div>
        </div>
      </WidgetCard>
    </div>
  );
};

export default ZoneHud;
