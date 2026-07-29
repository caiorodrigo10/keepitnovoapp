import type { PedidoStatus } from '@keepit/core-data';
import { darkColors } from '@keepit/ui-tokens';

/**
 * Metadados de exibição da máquina de estados do pedido (lado lojista) —
 * Story 0.10 (AC2/AC3). Cores SEMPRE de `@keepit/ui-tokens` (`darkColors`),
 * nunca hex hardcoded.
 */
export interface StatusBadge {
  label: string;
  bg: string;
  fg: string;
}

const STATUS_LABELS: Partial<Record<PedidoStatus, string>> = {
  aguardando_aceite: 'Novo',
  aceito: 'Em preparo',
  em_preparo: 'Em preparo',
  saindo_hub: 'Saindo pro hub',
  no_hub: 'Pronto no hub',
  entregue: 'Entregue',
  recusado: 'Recusado',
  nao_retirado: 'Não retirado',
};

export function getStatusBadge(status: PedidoStatus): StatusBadge {
  const label = STATUS_LABELS[status] ?? status;

  switch (status) {
    case 'aguardando_aceite':
      return { label, bg: darkColors.accent.brand, fg: darkColors.bg.primary };
    case 'no_hub':
    case 'entregue':
      return { label, bg: darkColors.bg.overlay, fg: darkColors.accent.brand };
    case 'recusado':
    case 'nao_retirado':
      return { label, bg: darkColors.bg.overlay, fg: darkColors.accent.warning };
    default:
      return { label, bg: darkColors.bg.overlay, fg: darkColors.text.secondary };
  }
}

/** "há {N} min"/"há {N} h" a partir de um timestamp ISO. */
export function tempoRelativo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60_000));
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  return `há ${Math.round(diffMin / 60)} h`;
}

export function formatReais(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export function inicialDoNome(nome: string): string {
  return nome.trim().charAt(0).toUpperCase() || '?';
}

const PRATELEIRA_LETRAS = ['A', 'B', 'C', 'D'];

/**
 * Deriva um código de prateleira de EXIBIÇÃO estável a partir do id do item
 * — `PedidoItem` (schema real) não tem esse campo, mesmo padrão de
 * `screens/catalogo/estoque.ts#estoqueDisplayFromId` (Story 0.9).
 * Puramente determinístico (mesmo id → mesmo valor sempre).
 */
export function prateleiraFromId(itemId: string): string {
  let hash = 0;
  for (let index = 0; index < itemId.length; index += 1) {
    hash = (hash * 31 + itemId.charCodeAt(index)) >>> 0;
  }
  const letra = PRATELEIRA_LETRAS[hash % PRATELEIRA_LETRAS.length];
  const numero = (hash % 9) + 1;
  return `${letra}${numero}`;
}
