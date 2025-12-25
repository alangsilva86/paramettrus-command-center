import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { DataQualityExceptionItem, DataQualityExceptionSummary } from '../../types/ops';
import { formatCurrencyBRL } from '../../../utils/format';
import { Button, Card, Input, Table, InfoTooltip } from '../ui';

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
  const tableColumns = [
    { header: 'Contrato', accessor: 'contract_id' },
    { header: 'Cliente', accessor: 'segurado_nome' },
    { header: 'Vendedor', accessor: 'vendedor_id' },
    {
      header: 'Impacto',
      render: (row: DataQualityExceptionItem) =>
        formatCurrencyBRL(row.impact),
      align: 'right'
    }
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="w-full max-w-3xl h-full bg-param-card border-l border-param-border shadow-[0_20px_50px_rgba(0,0,0,0.45)] p-5 overflow-y-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/60">
              <span>Exceções de Dados</span>
              <InfoTooltip
                description="Resumo das falhas de qualidade que distorcem decisões; cada carta mostra impacto estimado e permite navegar para os contratos afetados."
              />
            </div>
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
            <Card
              key={item.type}
              title={item.label}
              subtitle={`Impacto estimado ${formatCurrencyBRL(item.impact)}`}
              className="bg-[var(--surface-2)]"
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedType === item.type ? 'primary' : 'ghost'}
                    onClick={() => onSelectType(item.type)}
                    className="uppercase tracking-[0.3em] text-[10px]"
                  >
                    Abrir lista
                  </Button>
                  {onActionClick && item.action_label && (
                    <Button
                      variant="secondary"
                      onClick={() => onActionClick(item.type)}
                      className="uppercase tracking-[0.3em] text-[10px]"
                    >
                      {item.action_label}
                    </Button>
                  )}
                </div>
              }
            >
              <div className="text-[10px] text-[var(--muted)]">{item.count} casos ativos</div>
            </Card>
          ))}
          {summary.length === 0 && (
            <p className="text-xs text-[var(--muted)] italic">Nenhuma exceção crítica encontrada.</p>
          )}
        </div>

        <Card
          title={
            <InfoTooltip
              label="Detalhamento"
              description="Lista os contratos da exceção selecionada com impacto financeiro e permite aplicar filtros e carregar mais itens."
            />
          }
          className="mt-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">Tipo selecionado</p>
              <p className="text-sm font-semibold text-[var(--text)]">
                {selectedType ? `Tipo: ${selectedLabel}` : 'Selecione um tipo'}
              </p>
            </div>
            <div className="w-full max-w-xs">
              <Input
                label="Filtrar"
                value={searchTerm}
                onChange={(event) => onSearchTermChange(event.target.value)}
                placeholder="Vendedor, cliente, contrato"
              />
            </div>
          </div>

          {itemsLoading && <p className="text-xs text-[var(--muted)] italic mt-3">Carregando lista...</p>}
          {!itemsLoading && selectedType && filteredItems.length === 0 && (
            <p className="text-xs text-[var(--muted)] italic mt-3">Nenhum item encontrado.</p>
          )}

          {!itemsLoading && selectedType && filteredItems.length > 0 && (
            <div className="mt-3">
              <Table<DataQualityExceptionItem>
                columns={tableColumns}
                rows={filteredItems}
                rowKey={(row) => row.contract_id}
                ariaLabel={`Lista de exceções ${selectedLabel}`}
              />
            </div>
          )}

          {!itemsLoading && selectedType && hasMore && (
            <div className="mt-3 w-full">
              <Button
                variant="secondary"
                onClick={onLoadMore}
                className="w-full uppercase tracking-[0.3em] text-[10px]"
              >
                Carregar mais
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ExceptionsDrawer;
