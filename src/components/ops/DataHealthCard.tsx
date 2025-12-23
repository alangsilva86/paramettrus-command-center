import React from 'react';
import WidgetCard from '../../../components/WidgetCard';
import { DataQualityResponse } from '../../types/ops';

interface DataHealthCardProps {
  data: DataQualityResponse | null;
  loading: boolean;
  onOpenExceptions: () => void;
}

const statusTone = (status: DataQualityResponse['quality_status']) => {
  if (status === 'ok') return 'text-param-success';
  if (status === 'attention') return 'text-param-warning';
  return 'text-param-danger';
};

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
      <WidgetCard title="Saúde dos Dados">
        <div className="text-xs text-gray-600 italic">Carregando qualidade...</div>
      </WidgetCard>
    );
  }

  if (!data) {
    return (
      <WidgetCard title="Saúde dos Dados">
        <div className="text-xs text-gray-600 italic">Qualidade indisponível no momento.</div>
      </WidgetCard>
    );
  }

  const totalExceptions = data.exceptions.reduce((sum, item) => sum + item.count, 0);

  return (
    <WidgetCard title="Saúde dos Dados">
      <div className="flex flex-col gap-3 text-xs text-gray-300">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Freshness</span>
          <span className="text-white/80">{formatFreshness(data.freshness_minutes)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Cobertura</span>
          <span className="text-white/80">{Math.round(data.coverage_pct * 100)}% válidos</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Exceções críticas</span>
          <span className="text-white/80">{totalExceptions}</span>
        </div>
        <div className={`text-[10px] uppercase tracking-widest ${statusTone(data.quality_status)}`}>
          {data.quality_status === 'ok' ? 'OK' : data.quality_status === 'attention' ? 'Atenção' : 'Crítico'}
        </div>
        <div className="text-[10px] text-white/50">{data.quality_reason}</div>
        <button
          type="button"
          onClick={onOpenExceptions}
          disabled={totalExceptions === 0}
          className="text-[10px] font-bold uppercase tracking-widest text-param-primary hover:text-white disabled:text-white/30"
        >
          {totalExceptions > 0 ? 'Ver e corrigir exceções' : 'Sem exceções críticas'}
        </button>
      </div>
    </WidgetCard>
  );
};

export default DataHealthCard;
