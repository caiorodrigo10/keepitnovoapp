const VARIANT_CLASSES = {
  primary: 'bg-accent-brand text-bg-shell shadow-sm hover:brightness-105',
  secondary: 'bg-bg-elevated text-text-primary hover:bg-bg-overlay',
  danger: 'bg-bg-elevated text-accent-warning hover:bg-bg-overlay',
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  onClick,
  disabled = false,
  className = '',
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
