import React, { useEffect, useRef } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

const focusableSelectors = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const Modal: React.FC<ModalProps> = ({ open, onClose, title, description, children, actions }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const focusable = containerRef.current?.querySelectorAll<HTMLElement>(focusableSelectors);
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'Tab' && focusable?.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      role="presentation"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={containerRef}
        className="relative z-10 w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-md"
        role="dialog"
        aria-labelledby="modal-title"
      >
        <div className="flex flex-col gap-4">
          <header>
            <h2 id="modal-title" className="text-title-lg font-semibold text-[var(--text)]">
              {title}
            </h2>
            {description && (
              <p className="text-sm text-[var(--muted)]">{description}</p>
            )}
          </header>
          <div>{children}</div>
          {actions && (
            <footer className="flex flex-wrap justify-end gap-3">
              {actions}
            </footer>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;
