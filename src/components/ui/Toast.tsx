import React, { useEffect } from 'react';

type ToastTone = 'info' | 'success' | 'warning' | 'critical';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastProps {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
  action?: ToastAction;
  onClose: () => void;
}

const toneStyles: Record<ToastTone, string> = {
  info: 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]',
  success: 'bg-[var(--success)]/10 border border-[var(--success)] text-[var(--success)]',
  warning: 'bg-[var(--warning)]/10 border border-[var(--warning)] text-[var(--warning)]',
  critical: 'bg-[var(--danger)]/10 border border-[var(--danger)] text-[var(--danger)]'
};

const Toast: React.FC<ToastProps> = ({
  id,
  title,
  description,
  tone = 'info',
  duration = 4000,
  action,
  onClose
}) => {
  useEffect(() => {
    const timeout = setTimeout(() => onClose(), duration);
    return () => clearTimeout(timeout);
  }, [duration, onClose]);

  return (
    <div
      key={id}
      role="status"
      aria-live="polite"
      className={`flex min-h-[64px] w-full items-start justify-between gap-3 rounded-xl p-4 shadow-md ${toneStyles[tone]}`}
    >
      <div className="space-y-1 text-sm">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-xs text-[var(--muted)]">{description}</p>}
        {action && (
          <button
            type="button"
            onClick={action.onAction}
            className="text-[var(--primary)] hover:text-[var(--primary-press)] font-semibold"
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Fechar notificação"
        onClick={onClose}
        className="rounded-full border border-[var(--border)] p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        ✕
      </button>
    </div>
  );
};

export default Toast;
