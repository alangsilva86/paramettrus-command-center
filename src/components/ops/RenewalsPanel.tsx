import React from 'react';
import { formatCurrencyBRL } from '../../../utils/format';
import { RenewalListItem } from '../../../types';
import { Card, InfoTooltip } from '../ui';

interface RenewalsPanelProps {
  renewalsD7: RenewalListItem[];
  renewalsD15: RenewalListItem[];
  renewalsD30: RenewalListItem[];
}

const renderItem = (item: RenewalListItem) => (
  <div key={item.contract_id} className="border-b border-param-border pb-2">
    <div className="text-white font-bold text-sm">{item.segurado_nome || item.contract_id}</div>
    <div className="text-[10px] text-gray-500">
      {item.vendedor_id || 'Sem vendedor'} · D-{item.days_to_end} · {item.stage || 'SEM_ACAO'}
    </div>
    <div className="text-[10px] text-gray-400">Impacto {formatCurrencyBRL(item.comissao_valor || 0)}</div>
  </div>
);

const RenewalsPanel: React.FC<RenewalsPanelProps> = ({ renewalsD7, renewalsD15, renewalsD30 }) => {
  return (
    <Card title={<InfoTooltip label="Renovações Críticas" description="Contratos próximos do término que precisam de ação; cada coluna mostra janelas de D-7, D-15 e D-30." />}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'D-7', tone: 'critical', data: renewalsD7 },
          { label: 'D-15', tone: 'warning', data: renewalsD15 },
          { label: 'D-30', tone: 'primary', data: renewalsD30 }
        ].map((group) => (
          <div key={group.label} className="space-y-2">
            <div className={`text-[10px] uppercase tracking-[0.3em] ${
              group.tone === 'critical'
                ? 'text-[var(--danger)]'
                : group.tone === 'warning'
                ? 'text-[var(--warning)]'
                : 'text-[var(--primary)]'
            }`}>
              {group.label}
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {group.data.slice(0, 6).map(renderItem)}
              {group.data.length === 0 && (
                <div className="text-xs italic text-[var(--muted)]">
                  Nenhum {group.label === 'D-30' ? 'pré-alerta' : 'alerta'}.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default RenewalsPanel;
