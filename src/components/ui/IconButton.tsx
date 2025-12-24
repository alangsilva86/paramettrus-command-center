import React from 'react';

type IconButtonVariant = 'ghost' | 'surface';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  variant?: IconButtonVariant;
}

const variantStyles: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent border border-transparent text-[var(--text)] hover:bg-white/10 active:bg-white/20',
  surface: 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] active:bg-[var(--surface)]'
};

const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  variant = 'ghost',
  className = '',
  type = 'button',
  ...rest
}) => {
  if (!label) {
    console.warn('IconButton requires a descriptive label for accessibility.');
  }

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full border min-h-[48px] min-w-[48px] p-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--focus-ring)] ${variantStyles[variant]} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
};

export default IconButton;
