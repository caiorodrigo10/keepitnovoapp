const VARIANT_CLASSES = {
  neutral: 'bg-bg-elevated text-text-secondary',
  warning: 'bg-bg-elevated text-accent-warning',
  success: 'bg-bg-elevated text-accent-success',
  danger: 'bg-bg-elevated text-accent-warning',
} as const;

export type BadgeVariant = keyof typeof VARIANT_CLASSES;

/**
 * Badge arredondado (`border-radius: 20px` → token `rounded-badge`) — mesmo
 * padrão documentado em `ENTENDIMENTO_APP.md#Sistema de design` e reutilizado
 * do app Lojista (tema dark). [IDS] CREATE: não havia componente de UI
 * compartilhado no Admin além de `PageStub`; padrões avaliados (inline
 * `className` repetido em cada card) rejeitados por duplicar a mesma regra
 * de tokens em 3+ telas.
 */
export function Badge({ children, variant = 'neutral' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  return (
    <span
      className={`inline-flex items-center rounded-badge px-3 py-1 text-xs font-semibold uppercase tracking-badge ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
