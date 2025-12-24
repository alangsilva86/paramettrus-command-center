import React from 'react';
import { Badge, Button, Card } from '../ui';
import { DataQualityResponse } from '../../types/ops';

interface DataHealthCardProps {
  data: DataQualityResponse | null;
  loading: boolean;
  onOpenExceptions: () => void;
}

const formatFreshness = (minutes: number | null) => {
  if (minutes === null) return 'Sem atualização';
  if (minutes < 60) return `Atualizado há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `Atualizado há ${hours}h ${rest}m`;
};

const DataHealthCard: React.FC<DataHealthCardProps> = ({ data, loading, onOpenExceptions }) => {
  if (loading) {
    return (
      <Card title="Saúde dos Dados">
        <p className="text-xs text-[var(--muted)] italic">Carregando qualidade...</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title="Saúde dos Dados">
        <p className="text-xs text-[var(--muted)] italic">Qualidade indisponível no momento.</p>
      </Card>
    );
  }

  const totalExceptions = data.exceptions.reduce((sum, item) => sum + item.count, 0);
  const qualityLabel = data.quality_status === 'ok' ? 'OK' : data.quality_status === 'attention' ? 'Atenção' : 'Crítico';
  const qualityTone = data.quality_status === 'ok' ? 'success' : data.quality_status === 'attention' ? 'warning' : 'critical';

  return (
    <Card
      title="Saúde dos Dados"
      actions={
        <Button
          variant="ghost"
          onClick={onOpenExceptions}
          disabled={totalExceptions === 0}
          className="uppercase tracking-[0.3em] text-[10px]"
        >
          {totalExceptions > 0 ? 'Ver exceções' : 'Sem exceções críticas'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
          <span>Freshness</span>
          <span className="text-[var(--text)]">{formatFreshness(data.freshness_minutes)}</span>
        </div>
        <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
          <span>Cobertura</span>
          <span className="text-[var(--text)]">{Math.round(data.coverage_pct * 100)}% válidos</span>
        </div>
        <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
          <span>Exceções críticas</span>
          <span className="text-[var(--text)] font-semibold">{totalExceptions}</span>
        </div>
        <div className="flex items-center justify-between">
          <Badge tone={qualityTone} label={qualityLabel} />
          <span className="text-[12px] text-[var(--muted)]">{data.quality_reason}</span>
        </div>
      </div>
    </Card>
  );
};

export default DataHealthCard;
