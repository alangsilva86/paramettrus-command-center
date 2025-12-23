import React from 'react';
import WidgetCard from '../../../components/WidgetCard';
import { formatCurrencyBRL } from '../../../utils/format';
import AlertCenter, { AlertItem } from './AlertCenter';

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
      <WidgetCard title="Progresso da Meta" className="lg:col-span-1">
        <div className="flex flex-col gap-3 text-xs text-gray-300">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Realizado</div>
            <div className="text-lg font-bold text-white">{formatCurrencyBRL(realized)}</div>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full bg-param-primary" style={{ width: `${progressPct * 100}%` }} />
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-500">
            <span>Meta {formatCurrencyBRL(meta)}</span>
            <span>{Math.round(progressPct * 100)}% atingido</span>
          </div>
          <div className={`text-[10px] uppercase tracking-widest ${paceTone}`}>
            {staleForecast ? 'Previsão bloqueada (dados desatualizados)' : `Forecast ${Math.round(forecastPct * 100)}%`}
          </div>
          {!staleForecast && (
            <div className="text-sm font-bold text-white">{formatCurrencyBRL(forecast)}</div>
          )}
        </div>
      </WidgetCard>

      <WidgetCard title="Ritmo Necessário" className="lg:col-span-1">
        <div className="flex flex-col gap-3 text-xs text-gray-300">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Meta diária</div>
            <div className={`text-2xl font-bold ${gapDiario > 0 ? 'text-param-primary' : 'text-param-success'}`}>
              {gapDiario > 0 ? formatCurrencyBRL(gapDiario) : 'Meta batida'}
            </div>
          </div>
          <div className="text-[10px] text-white/50">
            Gap total: {formatCurrencyBRL(Math.max(0, gapTotal))}
          </div>
          <div className="text-[10px] text-white/50">
            {diasRestantes ? `Faltam ~${diasRestantes} dias úteis` : 'Ritmo estável'}
          </div>
        </div>
      </WidgetCard>

      <WidgetCard title="Ações do Dia" className="lg:col-span-1">
        <AlertCenter items={alertItems} />
      </WidgetCard>
    </div>
  );
};

export default DecisionRow;
