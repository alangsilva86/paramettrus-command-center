import React from 'react';
import { Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { formatCurrencyBRL } from '../../../utils/format';
import { QualityStatus } from '../../types/ops';

interface CommandBarProps {
  meta: number;
  realized: number;
  pacePct: number;
  lastUpdateLabel: string;
  qualityLabel: string;
  qualityStatus: QualityStatus;
  exceptionsCount: number;
  onSync: () => void;
  onOpenExceptions: () => void;
  onExport: () => void;
  syncLoading: boolean;
  syncDisabled?: boolean;
  exportDisabled?: boolean;
}

const qualityStyles: Record<QualityStatus, string> = {
  ok: 'border-param-success text-param-success bg-param-success/10',
  attention: 'border-param-warning text-param-warning bg-param-warning/10',
  critical: 'border-param-danger text-param-danger bg-param-danger/10'
};

const paceLabel = (pacePct: number) => {
  if (!Number.isFinite(pacePct)) return '—';
  const pct = Math.abs(pacePct * 100).toFixed(1);
  if (pacePct > 0) return `+${pct}% adiantado`;
  if (pacePct < 0) return `-${pct}% atrasado`;
  return '0% no ritmo';
};

const CommandBar: React.FC<CommandBarProps> = ({
  meta,
  realized,
  pacePct,
  lastUpdateLabel,
  qualityLabel,
  qualityStatus,
  exceptionsCount,
  onSync,
  onOpenExceptions,
  onExport,
  syncLoading,
  syncDisabled,
  exportDisabled
}) => {
  return (
    <div className="sticky top-4 z-40">
      <div className="rounded-2xl border border-param-border bg-param-card/90 backdrop-blur px-4 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">Meta do mês</div>
              <div className="text-lg font-bold text-white">{formatCurrencyBRL(meta)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">Realizado MTD</div>
              <div className="text-lg font-bold text-white">{formatCurrencyBRL(realized)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">Pace</div>
              <div className={`text-sm font-bold ${pacePct >= 0 ? 'text-param-success' : 'text-param-danger'}`}>
                {paceLabel(pacePct)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">Última atualização</div>
              <div className="text-sm font-bold text-white/80">{lastUpdateLabel}</div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-[10px] border text-[11px] ${qualityStyles[qualityStatus]}`}>
              <ShieldAlert className="w-4 h-4" />
              {qualityLabel}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSync}
              disabled={syncLoading || syncDisabled}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-primary bg-param-primary text-white hover:brightness-110 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              {syncLoading ? 'Sincronizando...' : 'Sincronizar agora'}
            </button>
            <button
              type="button"
              onClick={onOpenExceptions}
              disabled={exceptionsCount === 0}
              className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-border text-white/70 hover:border-param-primary disabled:opacity-50"
            >
              Ver exceções ({exceptionsCount})
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={exportDisabled}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-border text-white/70 hover:border-param-primary disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandBar;
