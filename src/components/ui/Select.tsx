import React from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>((props, ref) => {
  const { label, hint, error, className = '', children, ...rest } = props;

  return (
    <label className="flex flex-col gap-2 text-[var(--text)]">
      {label && (
        <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
          {label}
        </span>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={`appearance-none w-full min-h-[48px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 pr-10 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition-colors duration-150 focus-visible:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
            error ? 'border-[var(--danger)]' : ''
          } ${className}`}
          {...rest}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--muted)] select-none">
          ▾
        </span>
      </div>
      {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </label>
  );
});

Select.displayName = 'Select';

export default Select;
