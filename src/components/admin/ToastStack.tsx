import React from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const toastStyles = {
  success: 'border-param-success text-param-success bg-param-success/10',
  error: 'border-param-danger text-param-danger bg-param-danger/10',
  warning: 'border-param-warning text-param-warning bg-param-warning/10',
  info: 'border-param-border text-white/80 bg-param-card'
};

const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 w-[280px]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`border rounded-xl px-3 py-2 text-[11px] shadow-[0_8px_18px_rgba(0,0,0,0.35)] ${
            toastStyles[toast.type]
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-white/40 hover:text-white/80"
              aria-label="Fechar aviso"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ToastStack;
