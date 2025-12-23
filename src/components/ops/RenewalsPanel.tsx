import React from 'react';
import WidgetCard from '../../../components/WidgetCard';
import { formatCurrencyBRL } from '../../../utils/format';
import { RenewalListItem } from '../../../types';

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
    <WidgetCard title="Renovações Críticas">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-300">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-param-danger mb-2">D-7</div>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
            {renewalsD7.slice(0, 6).map(renderItem)}
            {renewalsD7.length === 0 && <div className="text-gray-600 italic">Sem críticos D-7</div>}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-param-warning mb-2">D-15</div>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
            {renewalsD15.slice(0, 6).map(renderItem)}
            {renewalsD15.length === 0 && <div className="text-gray-600 italic">Sem alertas D-15</div>}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-param-accent mb-2">D-30</div>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
            {renewalsD30.slice(0, 6).map(renderItem)}
            {renewalsD30.length === 0 && <div className="text-gray-600 italic">Sem pré-alertas D-30</div>}
          </div>
        </div>
      </div>
    </WidgetCard>
  );
};

export default RenewalsPanel;
