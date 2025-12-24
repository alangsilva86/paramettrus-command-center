import React from 'react';
import Card from '../src/components/ui/Card';

interface WidgetCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  alert?: boolean;
}

const WidgetCard: React.FC<WidgetCardProps> = ({ title, children, className = '', action, alert = false }) => {
  const alertClass = alert
    ? 'border-[var(--danger)] shadow-[0_0_0_1px_rgba(255,77,97,0.45)]'
    : 'border-[var(--border)]';

  return (
    <Card
      title={title}
      className={`${className} ${alertClass}`}
      actions={action}
    >
      {children}
    </Card>
  );
};

export default WidgetCard;
