import React from 'react';
import { AlertTriangle, ArrowRightCircle } from 'lucide-react';

export interface AlertItem {
  id: string;
  severity: 'critical' | 'attention' | 'info';
  title: string;
  description: string;
  impactLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface AlertCenterProps {
  items: AlertItem[];
}

const severityStyles: Record<AlertItem['severity'], string> = {
  critical: 'border-param-danger/60 bg-param-danger/10 text-param-danger',
  attention: 'border-param-warning/60 bg-param-warning/10 text-param-warning',
  info: 'border-param-border bg-param-card text-white/70'
};

const AlertCenter: React.FC<AlertCenterProps> = ({ items }) => {
  const visibleItems = items.slice(0, 3);

  return (
    <div className="flex flex-col gap-3 text-xs text-gray-300">
      {visibleItems.length === 0 && (
        <div className="text-gray-600 italic">Nenhuma ação crítica no momento.</div>
      )}
      {visibleItems.map((item) => (
        <div key={item.id} className={`border rounded-xl p-3 ${severityStyles[item.severity]}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {item.title}
              </div>
              <div className="text-[10px] text-white/60 mt-1">{item.description}</div>
            </div>
            {item.impactLabel && (
              <div className="text-[10px] font-bold text-white">{item.impactLabel}</div>
            )}
          </div>
          {item.actionLabel && item.onAction && (
            <button
              type="button"
              onClick={item.onAction}
              className="mt-2 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/80 hover:text-white"
            >
              {item.actionLabel}
              <ArrowRightCircle className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default AlertCenter;
