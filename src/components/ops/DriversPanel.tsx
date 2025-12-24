import React from 'react';
import { DashboardSnapshot } from '../../../types';
import { formatCurrencyBRL } from '../../../utils/format';
import { Card } from '../ui';

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
      <Card title="Drivers do Negócio">
        <p className="text-xs text-[var(--muted)] italic">Carregando drivers...</p>
      </Card>
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
    <Card title="Drivers do Negócio">
      <div className="text-[10px] text-[var(--muted)] mb-3">{driverSummary}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="border border-[var(--border)] rounded-xl p-3 flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">{card.label}</div>
            <div className="text-lg font-bold text-[var(--text)]">{card.value}</div>
            <div className={`text-[10px] ${deltaTone(card.delta)}`}>MoM {formatDelta(card.delta)}</div>
            <div className="text-[10px] text-[var(--muted)]">{card.insight}</div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default DriversPanel;
