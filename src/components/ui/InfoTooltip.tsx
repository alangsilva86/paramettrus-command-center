import React from 'react';

interface InfoTooltipProps {
  label?: string;
  description: string;
  className?: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ label, description, className = '' }) => (
  <div className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.3em] ${className}`}>
    {label && <span className="font-semibold">{label}</span>}
    <span
      role="img"
      aria-label={description}
      title={description}
      className="text-[var(--muted)] cursor-help"
    >
      ⓘ
    </span>
  </div>
);

export default InfoTooltip;
