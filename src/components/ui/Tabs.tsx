import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

const Tabs: React.FC<TabsProps> = ({ tabs, activeId, onChange, className = '' }) => (
  <div role="tablist" aria-label="abas de navegação" className={`flex flex-wrap gap-2 ${className}`}>
    {tabs.map((tab) => {
      const isActive = tab.id === activeId;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2 min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] transition ${
            isActive
              ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
              : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)]'
          } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <span className="text-sm font-semibold">{tab.label}</span>
          {tab.hint && <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">{tab.hint}</span>}
        </button>
      );
    })}
  </div>
);

export default Tabs;
