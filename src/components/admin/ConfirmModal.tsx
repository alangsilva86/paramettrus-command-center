import React from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  loading = false
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-param-border bg-param-card p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div className="text-xs uppercase tracking-widest text-white/60">Confirmação</div>
        <div className="text-lg font-bold text-white mt-2">{title}</div>
        <p className="text-[12px] text-white/60 mt-2">{description}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-border text-white/70 hover:border-param-primary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="text-[11px] font-bold uppercase tracking-widest px-4 py-2 h-10 rounded-[10px] border border-param-danger bg-param-danger text-white hover:brightness-110 disabled:opacity-60"
          >
            {loading ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
