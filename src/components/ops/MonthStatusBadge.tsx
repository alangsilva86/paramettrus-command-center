import React from 'react';
import { SnapshotStatusResponse } from '../../types/ops';
import { formatCurrencyBRL } from '../../../utils/format';
import { Badge, Card } from '../ui';

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
      <Card title="Status do Mês">
        <p className="text-xs text-[var(--muted)] italic">Carregando status...</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title="Status do Mês">
        <p className="text-xs text-[var(--muted)] italic">Status indisponível.</p>
      </Card>
    );
  }

  const stateLabel =
    data.state === 'CLOSED' ? 'Fechado' : data.state === 'PROCESSING' ? 'Processando' : 'Aberto';
  const stateTone =
    data.state === 'CLOSED'
      ? 'critical'
      : data.state === 'PROCESSING'
      ? 'warning'
      : 'success';

  return (
    <Card title="Status do Mês">
      <div className="flex flex-col gap-3 text-sm text-[var(--text)]">
        <div className="flex items-center gap-2">
          <Badge tone={stateTone} label={stateLabel} />
          <span className="text-[10px] text-[var(--muted)]">Último snapshot: {formatDateTime(data.last_snapshot_at)}</span>
        </div>
        {data.lock_reason && (
          <div className="text-[10px] text-[var(--danger)]">{data.lock_reason}</div>
        )}
        {data.rules && (
          <div className="border-t border-[var(--border)] pt-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">Regra vigente</div>
            <div className="text-sm font-bold text-[var(--text)]">
              {formatCurrencyBRL(data.rules.meta_global_comissao)} · {data.rules.dias_uteis} dias úteis
            </div>
            <div className="text-[10px] text-[var(--muted)]">
              Vigente desde {data.rules.effective_from}
            </div>
            <div className="text-[10px] text-[var(--muted)]">
              Última mudança: {formatDateTime(data.rules.created_at)} · {data.rules.created_by || 'Sistema'}
            </div>
            {data.rules.audit_note && (
              <div className="text-[10px] text-[var(--muted)] mt-1">{data.rules.audit_note}</div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default MonthStatusBadge;
