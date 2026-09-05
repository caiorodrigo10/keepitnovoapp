import type { Hub } from '@keepit/core-data';

import type { PersistedCartState } from './cartStorage';

export type CartOrderState = Pick<PersistedCartState, 'estabelecimentoId' | 'items' | 'hubId' | 'payment'>;

export interface AddItemInput {
  estabelecimentoId: string;
  produtoId: string;
  nome: string;
  precoReais: number;
  quantidade?: number;
  fotoUrl?: string | null;
}

export type CartTransition =
  | { kind: 'ready'; next: CartOrderState }
  | { kind: 'unchanged' }
  | { kind: 'confirmation_required'; reason: 'hub_switch' | 'store_switch' }
  | { kind: 'blocked'; reason: 'hub_unavailable' };

/**
 * Regra "1 pedido = 1 loja" (Story 6.1, AC3) — decide se é necessário
 * confirmar com o cliente ANTES de trocar de loja no carrinho (o que limpa
 * o carrinho atual). Antes desta Story a troca acontecia silenciosamente
 * dentro de `CartContext.addItem`. [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md
 * #Rodada 5]
 *
 * [IDS] CREATE — extraída de `CartContext.addItem` como função pura para ser
 * testável sem harness de teste de hook React (gap de infraestrutura já
 * documentado nas Stories 2.1/5.4/5.6: `apps/cliente` não tem
 * `@testing-library/react-native`/`react-test-renderer` configurado).
 */
export function shouldConfirmStoreSwitch(
  estabelecimentoIdAtual: string | null,
  novoEstabelecimentoId: string,
  quantidadeItensAtual: number,
): boolean {
  return (
    estabelecimentoIdAtual !== null && estabelecimentoIdAtual !== novoEstabelecimentoId && quantidadeItensAtual > 0
  );
}

export function planHubSelection(
  current: CartOrderState,
  hub: Pick<Hub, 'id' | 'ativo'>,
  confirmed: boolean,
): CartTransition {
  if (!hub.ativo) {
    return { kind: 'blocked', reason: 'hub_unavailable' };
  }

  if (current.hubId === hub.id) {
    return { kind: 'unchanged' };
  }

  if (current.items.length > 0 && !confirmed) {
    return { kind: 'confirmation_required', reason: 'hub_switch' };
  }

  return {
    kind: 'ready',
    next: {
      estabelecimentoId: null,
      items: [],
      hubId: hub.id,
      payment: null,
    },
  };
}

export function planItemAddition(
  current: CartOrderState,
  input: AddItemInput,
  confirmed: boolean,
): CartTransition {
  const requiresConfirmation = shouldConfirmStoreSwitch(
    current.estabelecimentoId,
    input.estabelecimentoId,
    current.items.length,
  );

  if (requiresConfirmation && !confirmed) {
    return { kind: 'confirmation_required', reason: 'store_switch' };
  }

  const switchesStore =
    current.estabelecimentoId !== null && current.estabelecimentoId !== input.estabelecimentoId;
  const base = switchesStore ? [] : current.items.map((item) => ({ ...item }));
  const existing = base.find((item) => item.produtoId === input.produtoId);
  const quantity = input.quantidade ?? 1;

  const items = existing
    ? base.map((item) =>
        item.produtoId === input.produtoId ? { ...item, quantidade: item.quantidade + quantity } : item,
      )
    : [
        ...base,
        {
          produtoId: input.produtoId,
          nome: input.nome,
          precoSnapshotReais: input.precoReais,
          quantidade: quantity,
          fotoUrl: input.fotoUrl,
        },
      ];

  return {
    kind: 'ready',
    next: {
      estabelecimentoId: input.estabelecimentoId,
      items,
      hubId: current.hubId,
      payment: switchesStore ? null : current.payment,
    },
  };
}
