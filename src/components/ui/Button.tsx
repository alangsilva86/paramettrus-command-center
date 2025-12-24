import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--primary)] border border-[var(--primary)] text-white hover:bg-[var(--primary)]/90 active:bg-[var(--primary-press)] focus-visible:ring-[var(--focus-ring)]',
  secondary:
    'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)] active:bg-[var(--surface-2)] focus-visible:ring-[var(--focus-ring)]',
  ghost:
    'bg-transparent border border-transparent text-[var(--text)] hover:bg-white/10 active:bg-white/20 focus-visible:ring-[var(--focus-ring)]',
  danger:
    'bg-[var(--danger)] border border-[var(--danger)] text-white hover:bg-[var(--danger)]/90 active:bg-[var(--danger)]/70 focus-visible:ring-[var(--focus-ring)]'
};

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold min-h-[48px] min-w-[48px] px-4 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]';

const Spinner = () => (
  <span className="inline-block h-4 w-4 animate-spin rounded-full border border-white/40 border-t-transparent" aria-hidden="true" />
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const {
    variant = 'primary',
    loading = false,
    fullWidth = false,
    startIcon,
    endIcon,
    disabled,
    className = '',
    children,
    type = 'button',
    ...rest
  } = props;

  const isDisabled = disabled || loading;
  const widthClass = fullWidth ? 'w-full' : 'inline-flex';
  const stateClass = variantStyles[variant];
  const loadingClass = loading ? 'opacity-70 cursor-wait' : 'select-none';

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={`${baseClasses} ${stateClass} ${widthClass} ${loadingClass} ${className}`}
      aria-busy={loading}
      {...rest}
    >
      {loading && <Spinner />}
      {startIcon && !loading && startIcon}
      <span className={`${loading ? 'opacity-60' : ''}`}>{children}</span>
      {endIcon && !loading && endIcon}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;
