import React from 'react';

type BadgeTone = 'primary' | 'success' | 'warning' | 'critical' | 'muted';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: React.ReactNode;
}

const toneStyles: Record<BadgeTone, string> = {
  primary: 'bg-[var(--primary)] text-white',
  success: 'bg-[var(--success)] text-white',
  warning: 'bg-[var(--warning)] text-black',
  critical: 'bg-[var(--danger)] text-white',
  muted: 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--muted)]'
};

const Badge: React.FC<BadgeProps> = ({ label, tone = 'muted', icon }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${toneStyles[tone]}`}>
    {icon}
    {label}
  </span>
);

export default Badge;
