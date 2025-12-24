import React from 'react';
import { Toast } from '../ui';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const toneMap: Record<ToastMessage['type'], 'success' | 'critical' | 'warning' | 'info'> = {
  success: 'success',
  error: 'critical',
  warning: 'warning',
  info: 'info'
};

const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 w-[320px]">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          tone={toneMap[toast.type]}
          title={toast.message}
          onClose={() => onDismiss(toast.id)}
        />
      ))}
    </div>
  );
};

export default ToastStack;
