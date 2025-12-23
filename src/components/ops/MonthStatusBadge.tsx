import React from 'react';
import WidgetCard from '../../../components/WidgetCard';
import { SnapshotStatusResponse } from '../../types/ops';
import { formatCurrencyBRL } from '../../../utils/format';

interface MonthStatusBadgeProps {
  data: SnapshotStatusResponse | null;
  loading: boolean;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
};

const MonthStatusBadge: React.FC<MonthStatusBadgeProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <WidgetCard title="Status do Mês">
        <div className="text-xs text-gray-600 italic">Carregando status...</div>
      </WidgetCard>
    );
  }

  if (!data) {
    return (
      <WidgetCard title="Status do Mês">
        <div className="text-xs text-gray-600 italic">Status indisponível.</div>
      </WidgetCard>
    );
  }

  const stateLabel =
    data.state === 'CLOSED' ? 'Fechado' : data.state === 'PROCESSING' ? 'Processando' : 'Aberto';
  const stateTone =
    data.state === 'CLOSED'
      ? 'text-param-danger'
      : data.state === 'PROCESSING'
      ? 'text-param-warning'
      : 'text-param-success';

  return (
    <WidgetCard title="Status do Mês">
      <div className="flex flex-col gap-3 text-xs text-gray-300">
        <div className={`text-lg font-bold ${stateTone}`}>{stateLabel}</div>
        <div className="text-[10px] text-white/50">Último snapshot: {formatDateTime(data.last_snapshot_at)}</div>
        {data.lock_reason && (
          <div className="text-[10px] text-param-danger">{data.lock_reason}</div>
        )}
        {data.rules && (
          <div className="border-t border-param-border pt-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Regra vigente</div>
            <div className="text-sm font-bold text-white">
              {formatCurrencyBRL(data.rules.meta_global_comissao)} · {data.rules.dias_uteis} dias úteis
            </div>
            <div className="text-[10px] text-white/50">
              Vigente desde {data.rules.effective_from}
            </div>
            <div className="text-[10px] text-white/40">
              Última mudança: {formatDateTime(data.rules.created_at)} · {data.rules.created_by || 'Sistema'}
            </div>
            {data.rules.audit_note && (
              <div className="text-[10px] text-white/50 mt-1">{data.rules.audit_note}</div>
            )}
          </div>
        )}
      </div>
    </WidgetCard>
  );
};

export default MonthStatusBadge;
