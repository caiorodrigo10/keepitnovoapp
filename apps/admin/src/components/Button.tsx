/**
 * Exportado para reuso por `LinkButton` (Story 11.2, AC2) — evita duplicar a
 * mesma paleta de cores/hover em componentes de navegação (`next/link`)
 * estilizados como CTA.
 */
export const BUTTON_VARIANT_CLASSES = {
  primary: 'bg-accent-brand text-bg-shell shadow-sm hover:brightness-105',
  secondary: 'bg-bg-elevated text-text-primary hover:bg-bg-overlay',
  danger: 'bg-bg-elevated text-accent-warning hover:bg-bg-overlay',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT_CLASSES;

/** Área de toque 44px (`min-h-11`) e raio `md` — mesma base para `Button` e `LinkButton`. */
export const BUTTON_BASE_CLASSES = 'min-h-11 rounded-md px-4 py-2 text-sm font-semibold transition-colors';

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
      className={`${BUTTON_BASE_CLASSES} disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
