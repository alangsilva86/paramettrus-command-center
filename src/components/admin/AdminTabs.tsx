import React from 'react';

export interface AdminTabItem {
  id: string;
  label: string;
  hint: string;
  badge?: number | string;
  alert?: boolean;
}

interface AdminTabsProps {
  tabs: AdminTabItem[];
  activeTab: string;
  onChange: (id: string) => void;
}

const AdminTabs: React.FC<AdminTabsProps> = ({ tabs, activeTab, onChange }) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 bg-param-card border border-param-border rounded-xl p-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`relative px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-[10px] transition-colors ${
                isActive ? 'bg-param-primary text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {tab.badge !== undefined && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-param-border text-white/70">
                    {tab.badge}
                  </span>
                )}
              </span>
              {tab.alert && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-param-warning" />
              )}
            </button>
          );
        })}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-white/50">
        {tabs.find((tab) => tab.id === activeTab)?.hint || 'Selecione uma seção'}
      </div>
    </div>
  );
};

export default AdminTabs;
