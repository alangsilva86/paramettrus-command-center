import React, { KeyboardEvent } from 'react';

export interface TableColumn<T> {
  header: React.ReactNode;
  accessor?: keyof T;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  selectedRowId?: string;
  ariaLabel?: string;
}

const Table = <T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedRowId,
  ariaLabel
}: TableProps<T>) => {
  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row);
    }
  };

  return (
    <div
      className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
      role="region"
      aria-label={ariaLabel ?? 'tabela interativa'}
    >
      <table className="min-w-full divide-y divide-[var(--border)]">
        <thead className="sticky top-0 bg-[var(--surface-2)]">
          <tr>
            {columns.map((column, index) => (
              <th
                key={`${column.header}-${index}`}
                scope="col"
                className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--muted)] ${
                  column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                }`}
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const id = rowKey ? rowKey(row, index) : `${(row as Record<string, unknown>).id ?? index}`;
            const isSelected = selectedRowId ? selectedRowId === id : false;

            return (
              <tr
                key={id || index}
                tabIndex={onRowClick ? 0 : -1}
                onKeyDown={(event) => handleRowKeyDown(event, row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`group cursor-pointer min-h-[48px] border-b border-[var(--border)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                  isSelected ? 'bg-[var(--primary)]/10' : ''
                }`}
              >
                {columns.map((column, colIndex) => {
                  const value = column.render ? column.render(row) : column.accessor ? row[column.accessor] : null;
                  return (
                    <td
                      key={`${value}-${colIndex}`}
                      className={`px-4 py-3 text-sm ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}
                    >
                      <span className="text-[var(--text)]">{value}</span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Table;
