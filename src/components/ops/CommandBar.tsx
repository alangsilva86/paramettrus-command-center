import React from 'react';
import { Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { formatCurrencyBRL } from '../../../utils/format';
import { Badge, IconButton } from '../ui';
import { QualityStatus } from '../../types/ops';

interface CommandBarProps {
  meta: number;
  realized: number;
  pacePct: number;
  lastUpdateLabel: string;
  qualityLabel: string;
  qualityStatus: QualityStatus;
  qualityReason: string;
  exceptionsCount: number;
  onSync: () => void;
  onOpenExceptions: () => void;
  onExport: () => void;
  syncLoading: boolean;
  syncDisabled?: boolean;
  exportDisabled?: boolean;
  isRange?: boolean;
}

const qualityToneMap: Record<QualityStatus, 'success' | 'warning' | 'critical'> = {
  ok: 'success',
  attention: 'warning',
  critical: 'critical'
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
  qualityReason,
  exceptionsCount,
  onSync,
  onOpenExceptions,
  onExport,
  syncLoading,
  syncDisabled,
  exportDisabled,
  isRange = false
}) => {
  const metaLabel = isRange ? 'Meta do período' : 'Meta do mês';
  const realizedLabel = isRange ? 'Realizado no período' : 'Realizado MTD';
  const paceTitle = isRange ? 'Pace do período' : 'Pace';
  return (
    <div className="sticky top-4 z-40">
      <div className="rounded-2xl border border-param-border bg-param-card/90 backdrop-blur px-4 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">{metaLabel}</div>
              <div className="text-lg font-bold text-white">{formatCurrencyBRL(meta)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">{realizedLabel}</div>
              <div className="text-lg font-bold text-white">{formatCurrencyBRL(realized)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">{paceTitle}</div>
              <div className={`text-sm font-bold ${pacePct >= 0 ? 'text-param-success' : 'text-param-danger'}`}>
                {paceLabel(pacePct)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">Última atualização</div>
              <div className="text-sm font-bold text-white/80">{lastUpdateLabel}</div>
            </div>
            <Badge tone={qualityToneMap[qualityStatus]} icon={<ShieldAlert className="w-4 h-4" />}>
              {qualityLabel}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <IconButton
              icon={<RefreshCw className={`w-4 h-4 ${syncLoading ? 'animate-spin' : ''}`} />}
              label={syncLoading ? 'Sincronizando' : 'Sincronizar dados'}
              variant="ghost"
              onClick={onSync}
              disabled={syncLoading || syncDisabled}
              className="p-2 text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <div className="relative">
              <IconButton
                icon={<ShieldAlert className="w-4 h-4" />}
                label={exceptionsCount > 0 ? `Exceções (${exceptionsCount})` : 'Sem exceções'}
                variant="ghost"
                onClick={onOpenExceptions}
                disabled={exceptionsCount === 0}
                className="p-2 text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed"
              />
              {exceptionsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-[var(--danger)] text-white text-[9px] font-semibold flex items-center justify-center">
                  {exceptionsCount}
                </span>
              )}
            </div>
            <IconButton
              icon={<Download className="w-4 h-4" />}
              label="Exportar dados"
              variant="ghost"
              onClick={onExport}
              disabled={exportDisabled}
              className="p-2 text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        </div>
        <div className="mt-2 text-[10px] text-white/60">{qualityReason}</div>
      </div>
    </div>
  );
};

export default CommandBar;
