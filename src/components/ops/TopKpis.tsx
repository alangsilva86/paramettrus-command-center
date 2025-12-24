import React from 'react';
import { DashboardSnapshot } from '../../../types';
import { formatCurrencyBRL } from '../../../utils/format';
import { Card, InfoTooltip } from '../ui';

interface TopKpisProps {
  kpis: DashboardSnapshot['kpis'];
}

const TopKpis: React.FC<TopKpisProps> = ({ kpis }) => {
  const pct = Math.min(Math.max(kpis.pct_meta || 0, 0), 1) * 100;
  const radius = 80;
  const circumference = radius * Math.PI;
  const offset = circumference - (pct / 100) * circumference;

  const isForecastGood = kpis.forecast_pct_meta >= 1.0;
  const isForecastRisk = kpis.forecast_pct_meta < 0.9;
  const forecastClass = isForecastGood
    ? 'text-success'
    : isForecastRisk
    ? 'text-danger'
    : 'text-warning';

  const gaugeColor = pct >= 90 ? 'var(--primary)' : pct >= 70 ? 'rgb(var(--warning))' : 'rgb(var(--danger))';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card
        title={
          <InfoTooltip
            label="Comissão MTD"
            description="Valor acumulado realizado no mês atual; o medidor mostra % da meta atingida com projeção."
          />
        }
        className="lg:col-span-2"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="relative w-44 h-24 flex items-end justify-center overflow-hidden">
            <svg className="w-full h-full" viewBox="0 0 200 100">
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="var(--border)"
                strokeWidth="20"
              />
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
            <div className="absolute bottom-0 text-3xl font-bold text-[var(--text)]">
              {Math.round(pct)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-[var(--text)] tracking-tight">
              {formatCurrencyBRL(kpis.comissao_mtd)}
            </div>
            <div className={`text-xs font-bold mt-2 flex items-center justify-end gap-1 ${forecastClass}`}>
              PROJEÇÃO: {formatCurrencyBRL(kpis.forecast_comissao)}
            </div>
            <div className="text-[10px] text-[var(--muted)]">
              (Anti-Pânico Weighted Forecast)
            </div>
          </div>
        </div>
      </Card>

      <Card title={<InfoTooltip
        label="Gap Diário"
        description="Quanto falta (ou sobrou) para atingir a meta diária projetada; 'LIVRE' indica excedente."
      />}>
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="text-xs text-[var(--muted)] mb-1 uppercase tracking-[0.3em]">
            Sua meta hoje
          </div>
          <div className={`text-3xl font-black ${kpis.gap_diario > 0 ? 'text-primary' : 'text-success'}`}>
            {kpis.gap_diario > 0 ? formatCurrencyBRL(kpis.gap_diario) : 'LIVRE'}
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-2 text-center w-full border-t border-[var(--border)] pt-2 uppercase tracking-[0.3em]">
            Ritmo necessário
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TopKpis;
