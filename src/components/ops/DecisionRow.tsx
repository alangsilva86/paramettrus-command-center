import React from 'react';
import { formatCurrencyBRL } from '../../../utils/format';
import AlertCenter, { AlertItem } from './AlertCenter';
import { Card } from '../ui';

interface DecisionRowProps {
  meta: number;
  realized: number;
  forecast: number;
  forecastPct: number;
  gapDiario: number;
  gapTotal: number;
  diasRestantes: number | null;
  staleForecast: boolean;
  alertItems: AlertItem[];
}

const DecisionRow: React.FC<DecisionRowProps> = ({
  meta,
  realized,
  forecast,
  forecastPct,
  gapDiario,
  gapTotal,
  diasRestantes,
  staleForecast,
  alertItems
}) => {
  const progressPct = meta > 0 ? Math.min(1, realized / meta) : 0;
  const paceTone = forecastPct >= 1 ? 'text-param-success' : forecastPct >= 0.95 ? 'text-param-warning' : 'text-param-danger';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Progresso da Meta" className="lg:col-span-1">
        <div className="flex flex-col gap-3 text-sm text-[var(--text)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">Realizado</div>
            <div className="text-xl md:text-2xl font-bold tracking-tight">{formatCurrencyBRL(realized)}</div>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-[var(--primary)] transition-all duration-300"
              style={{ width: `${progressPct * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
            <span>Meta {formatCurrencyBRL(meta)}</span>
            <span>{Math.round(progressPct * 100)}% atingido</span>
          </div>
          <div className={`text-[10px] uppercase tracking-[0.3em] ${paceTone}`}>
            {staleForecast ? 'Previsão bloqueada (dados desatualizados)' : `Forecast ${Math.round(forecastPct * 100)}%`}
          </div>
          {!staleForecast && (
            <div className="text-lg font-semibold">{formatCurrencyBRL(forecast)}</div>
          )}
        </div>
      </Card>

      <Card title="Ritmo Necessário" className="lg:col-span-1">
        <div className="flex flex-col gap-3 text-sm text-[var(--text)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">Meta diária</div>
            <div className={`text-2xl font-bold ${gapDiario > 0 ? 'text-[var(--primary)]' : 'text-[var(--success)]'}`}>
              {gapDiario > 0 ? formatCurrencyBRL(gapDiario) : 'Meta batida'}
            </div>
          </div>
          <div className="text-[10px] text-[var(--muted)]">
            Gap total: {formatCurrencyBRL(Math.max(0, gapTotal))}
          </div>
          <div className="text-[10px] text-[var(--muted)]">
            {diasRestantes ? `Faltam ~${diasRestantes} dias úteis` : 'Ritmo estável'}
          </div>
        </div>
      </Card>

      <Card title="Ações do Dia" className="lg:col-span-1">
        <AlertCenter items={alertItems} />
      </Card>
    </div>
  );
};

export default DecisionRow;
