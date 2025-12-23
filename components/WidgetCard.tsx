import React from 'react';

interface WidgetCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  alert?: boolean;
}

const WidgetCard: React.FC<WidgetCardProps> = ({ title, children, className = '', action, alert = false }) => {
  return (
    <div className={`
      relative flex flex-col p-4 md:p-5 lg:p-6 rounded-xl
      bg-param-card border transition-all duration-300
      shadow-[0_1px_2px_rgba(0,0,0,0.35),0_10px_24px_rgba(0,0,0,0.2)]
      ${alert ? 'border-param-danger shadow-[0_0_0_1px_rgba(185,28,28,0.35)]' : 'border-param-border'}
      ${className}
    `}>
      {(title || action) && (
        <div className="flex justify-between items-center mb-4">
          {title && (
            <h3 className="text-xs uppercase tracking-widest font-bold text-gray-400">
              {title}
            </h3>
          )}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="flex-1 flex flex-col justify-center">
        {children}
      </div>
    </div>
  );
};

export default WidgetCard;
