import React from 'react';
import WidgetCard from '../../../components/WidgetCard';
import { DashboardSnapshot } from '../../../types';
import { formatCurrencyBRL } from '../../../utils/format';

interface DriversPanelProps {
  snapshot: DashboardSnapshot | null;
}

const formatDelta = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
const deltaTone = (value: number) => (value >= 0 ? 'text-param-success' : 'text-param-danger');

const buildInsight = (label: string, delta: number) => {
  if (!Number.isFinite(delta)) return `${label} sem variação relevante.`;
  if (delta > 0.02) return `${label} acima do mês anterior.`;
  if (delta < -0.02) return `${label} abaixo do mês anterior.`;
  return `${label} estável vs mês anterior.`;
};

const DriversPanel: React.FC<DriversPanelProps> = ({ snapshot }) => {
  if (!snapshot) {
    return (
      <WidgetCard title="Drivers do Negócio">
        <div className="text-xs text-gray-600 italic">Carregando drivers...</div>
      </WidgetCard>
    );
  }

  const { kpis } = snapshot;
  const autoSharePct = Math.round((kpis.auto_share_comissao || 0) * 100);
  const driverSummary =
    autoSharePct >= 60
      ? `Driver do dia: mix AUTO em ${autoSharePct}% (risco de concentração).`
      : `Driver do dia: mix equilibrado com AUTO em ${autoSharePct}%.`;

  const cards = [
    {
      label: 'Prêmio MTD',
      value: formatCurrencyBRL(kpis.premio_mtd),
      delta: kpis.mom_premio_pct,
      insight: buildInsight('Prêmio', kpis.mom_premio_pct)
    },
    {
      label: 'Margem Média',
      value: `${kpis.margem_media_pct.toFixed(1)}%`,
      delta: kpis.mom_margem_pct,
      insight: buildInsight('Margem', kpis.mom_margem_pct)
    },
    {
      label: 'Ticket Médio',
      value: formatCurrencyBRL(kpis.ticket_medio),
      delta: kpis.mom_ticket_pct,
      insight: buildInsight('Ticket', kpis.mom_ticket_pct)
    },
    {
      label: 'Comissão MTD',
      value: formatCurrencyBRL(kpis.comissao_mtd),
      delta: kpis.mom_comissao_pct,
      insight: buildInsight('Comissão', kpis.mom_comissao_pct)
    }
  ];

  return (
    <WidgetCard title="Drivers do Negócio">
      <div className="text-[10px] text-white/50 mb-3">{driverSummary}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-gray-300">
        {cards.map((card) => (
          <div key={card.label} className="border border-param-border rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">{card.label}</div>
            <div className="text-lg font-bold text-white mt-1">{card.value}</div>
            <div className={`text-[10px] mt-1 ${deltaTone(card.delta)}`}>MoM {formatDelta(card.delta)}</div>
            <div className="text-[10px] text-white/50 mt-1">{card.insight}</div>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
};

export default DriversPanel;
