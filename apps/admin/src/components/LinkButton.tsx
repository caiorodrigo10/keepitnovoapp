import Link from 'next/link';

import { BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES, type ButtonVariant } from './Button';

/**
 * Variante do `Button` para ações de navegação (`next/link`) — Story 11.2
 * (AC1, AC2). Antes deste componente, seis telas (Hubs, Lojistas, Pedidos,
 * Reembolsos, Saques) duplicavam classes soltas com `rounded-sm` e hovers
 * divergentes (`hover:opacity-90` em vez de `hover:brightness-105`) para o
 * mesmo padrão visual de CTA/link secundário.
 *
 * [IDS] ADAPT: reaproveita `BUTTON_BASE_CLASSES`/`BUTTON_VARIANT_CLASSES` de
 * `Button.tsx` (raio `md`, altura mínima 44px, cores de token) em vez de
 * duplicar a paleta — `Button` continua exclusivo para `<button>` (ações
 * locais), `LinkButton` para navegação real (`href`), preservando a
 * semântica de link exigida por rota/acessibilidade (AC2: "sem alterar
 * rota, handler ou semântica").
 */
export function LinkButton({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center ${BUTTON_BASE_CLASSES} ${BUTTON_VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
