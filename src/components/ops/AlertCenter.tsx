import React from 'react';
import { ArrowRightCircle } from 'lucide-react';
import { Button, Card, Badge } from '../ui';

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

const toneMap: Record<AlertItem['severity'], 'critical' | 'warning' | 'muted'> = {
  critical: 'critical',
  attention: 'warning',
  info: 'muted'
};

const AlertCenter: React.FC<AlertCenterProps> = ({ items }) => {
  const visibleItems = items.slice(0, 3);

  if (visibleItems.length === 0) {
    return (
      <Card title="Ações recomendadas">
        <p className="text-xs text-[var(--muted)] italic">Nenhuma ação crítica no momento.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visibleItems.map((item) => (
        <Card
          key={item.id}
          title={item.title}
          className="bg-[var(--surface-2)]"
          actions={
            item.actionLabel && item.onAction ? (
              <Button
                variant="ghost"
                onClick={item.onAction}
                className="uppercase tracking-[0.3em] text-[10px]"
              >
                {item.actionLabel}
                <ArrowRightCircle className="w-4 h-4" />
              </Button>
            ) : null
          }
        >
          <div className="flex flex-col gap-2 text-[12px]">
            <div className="flex items-center justify-between">
              <Badge tone={toneMap[item.severity]} label={item.severity.toUpperCase()} />
              {item.impactLabel && (
                <span className="text-[10px] font-semibold text-[var(--muted)]">{item.impactLabel}</span>
              )}
            </div>
            <p className="text-sm text-[var(--text)]">{item.description}</p>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default AlertCenter;
