import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { DataQualityExceptionItem, DataQualityExceptionSummary } from '../../types/ops';
import { formatCurrencyBRL } from '../../../utils/format';

interface ExceptionsDrawerProps {
  open: boolean;
  onClose: () => void;
  summary: DataQualityExceptionSummary[];
  selectedType: string | null;
  onSelectType: (type: string) => void;
  items: DataQualityExceptionItem[];
  itemsLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onActionClick?: (type: string) => void;
}

const ExceptionsDrawer: React.FC<ExceptionsDrawerProps> = ({
  open,
  onClose,
  summary,
  selectedType,
  onSelectType,
  items,
  itemsLoading,
  hasMore,
  onLoadMore,
  searchTerm,
  onSearchTermChange
}) => {
  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const term = searchTerm.toLowerCase();
    return items.filter((item) =>
      [item.contract_id, item.segurado_nome, item.vendedor_id, item.ramo]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [items, searchTerm]);
  const selectedLabel = summary.find((item) => item.type === selectedType)?.label || selectedType;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="w-full max-w-3xl h-full bg-param-card border-l border-param-border shadow-[0_20px_50px_rgba(0,0,0,0.45)] p-5 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/60">Exceções de Dados</div>
            <div className="text-lg font-bold text-white">Corrigir o que quebra decisões</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3">
          {summary.map((item) => (
            <div key={item.type} className="border border-param-border rounded-xl p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-white">{item.label}</div>
                  <div className="text-[10px] text-white/50">Impacto estimado {formatCurrencyBRL(item.impact)}</div>
                </div>
                <div className="text-[11px] text-white/70">{item.count} casos</div>
                <button
                  type="button"
                  onClick={() => onSelectType(item.type)}
                  className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-[10px] border ${
                    selectedType === item.type
                      ? 'border-param-primary text-param-primary'
                      : 'border-param-border text-white/60 hover:border-param-primary'
                  }`}
                >
                  Abrir lista
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {onActionClick && (
                  <button
                    type="button"
                    onClick={() => onActionClick(item.type)}
                    className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-[10px] border border-param-primary text-param-primary hover:border-white"
                  >
                    {item.action_label}
                  </button>
                )}
              </div>
            </div>
          ))}
          {summary.length === 0 && (
            <div className="text-xs text-gray-600 italic">Nenhuma exceção crítica encontrada.</div>
          )}
        </div>

        <div className="mt-6 border-t border-param-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/60">Detalhamento</div>
              <div className="text-sm font-bold text-white">
                {selectedType ? `Tipo: ${selectedLabel}` : 'Selecione um tipo'}
              </div>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Filtrar por vendedor, cliente ou contrato"
              className="bg-param-bg border border-param-border text-xs text-white px-3 py-2 h-10 rounded-[10px] focus:outline-none focus:border-param-primary"
            />
          </div>

          {itemsLoading && <div className="text-xs text-gray-600 italic mt-3">Carregando lista...</div>}
          {!itemsLoading && selectedType && (
            <div className="mt-3 border border-param-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-4 bg-param-bg text-[10px] text-gray-400 px-3 py-2">
                <span>Contrato</span>
                <span>Cliente</span>
                <span>Vendedor</span>
                <span>Impacto</span>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {filteredItems.map((item) => (
                  <div key={item.contract_id} className="grid grid-cols-4 gap-2 px-3 py-2 border-t border-param-border text-[11px]">
                    <span className="text-white/80">{item.contract_id}</span>
                    <span className="text-white/70">{item.segurado_nome || '—'}</span>
                    <span className="text-white/70">{item.vendedor_id || '—'}</span>
                    <span className="text-white/90 font-bold">{formatCurrencyBRL(item.impact)}</span>
                  </div>
                ))}
                {filteredItems.length === 0 && (
                  <div className="text-xs text-gray-600 italic px-3 py-4">Nenhum item encontrado.</div>
                )}
              </div>
            </div>
          )}

          {!itemsLoading && selectedType && hasMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className="mt-3 text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-[10px] border border-param-border text-white/70 hover:border-param-primary"
            >
              Carregar mais
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExceptionsDrawer;
