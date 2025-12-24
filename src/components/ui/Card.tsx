import React from 'react';

export interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  tone?: 'default' | 'accent';
}

const Card: React.FC<CardProps> = ({ title, subtitle, actions, className = '', children, tone = 'default' }) => (
  <div
    className={`w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm ${className}`}
    role="region"
    aria-label={title || 'card informacional'}
  >
    {(title || subtitle || actions) && (
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          {title && (
            <p className="text-title-md font-semibold text-[var(--text)]">{title}</p>
          )}
          {subtitle && (
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            {actions}
          </div>
        )}
      </div>
    )}
    <div className={tone === 'accent' ? 'text-white' : 'text-[var(--text)]'}>{children}</div>
  </div>
);

export default Card;
