import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const { label, hint, error, className = '', ...rest } = props;

  return (
    <label className="flex flex-col gap-2 text-[var(--text)]">
      {label && (
        <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
          {label}
        </span>
      )}
      <input
        ref={ref}
        className={`w-full min-h-[48px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition-colors duration-150 focus-visible:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
          error ? 'border-[var(--danger)]' : ''
        } ${className}`}
        {...rest}
      />
      {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </label>
  );
});

Input.displayName = 'Input';

export default Input;
