import { describe, expect, it } from 'vitest';

import {
  planHubSelection,
  planItemAddition,
  shouldConfirmStoreSwitch,
  type AddItemInput,
  type CartOrderState,
} from './cartRules';

describe('shouldConfirmStoreSwitch (Story 6.1, AC3)', () => {
  it('não confirma quando não há loja atual (carrinho vazio, primeiro item)', () => {
    expect(shouldConfirmStoreSwitch(null, 'estab-2', 0)).toBe(false);
  });

  it('não confirma quando é a mesma loja', () => {
    expect(shouldConfirmStoreSwitch('estab-1', 'estab-1', 3)).toBe(false);
  });

  it('não confirma quando o carrinho atual está vazio, mesmo trocando de loja', () => {
    expect(shouldConfirmStoreSwitch('estab-1', 'estab-2', 0)).toBe(false);
  });

  it('confirma quando troca de loja com carrinho atual não-vazio', () => {
    expect(shouldConfirmStoreSwitch('estab-1', 'estab-2', 2)).toBe(true);
  });
});

describe('cart transition planners (Story 12.9)', () => {
  const filled: CartOrderState = {
    estabelecimentoId: 'loja-a',
    hubId: 'hub-a',
    payment: { type: 'pix' },
    items: [{ produtoId: 'p-a', nome: 'Item A', precoSnapshotReais: 10, quantidade: 1 }],
  };

  it('não produz próximo estado antes de confirmar troca de hub', () => {
    expect(planHubSelection(filled, { id: 'hub-b', ativo: true }, false)).toEqual({
      kind: 'confirmation_required',
      reason: 'hub_switch',
    });
    expect(filled).toMatchObject({
      hubId: 'hub-a',
      estabelecimentoId: 'loja-a',
      items: [{ produtoId: 'p-a' }],
    });
  });

  it('confirma a troca de hub limpando carrinho/loja/pagamento no mesmo snapshot', () => {
    expect(planHubSelection(filled, { id: 'hub-b', ativo: true }, true)).toEqual({
      kind: 'ready',
      next: { hubId: 'hub-b', estabelecimentoId: null, items: [], payment: null },
    });
  });

  it('bloqueia hub inativo e troca hub com carrinho vazio sem confirmação', () => {
    expect(planHubSelection(filled, { id: 'hub-off', ativo: false }, true)).toEqual({
      kind: 'blocked',
      reason: 'hub_unavailable',
    });
    expect(
      planHubSelection({ ...filled, items: [], estabelecimentoId: null }, { id: 'hub-b', ativo: true }, false),
    ).toMatchObject({ kind: 'ready', next: { hubId: 'hub-b' } });
  });

  it('mantém o estado quando o hub selecionado já é o atual', () => {
    expect(planHubSelection(filled, { id: 'hub-a', ativo: true }, false)).toEqual({ kind: 'unchanged' });
  });

  it('exige confirmação para trocar de loja e substitui o carrinho quando confirmada', () => {
    const itemB: AddItemInput = {
      estabelecimentoId: 'loja-b',
      produtoId: 'p-b',
      nome: 'Item B',
      precoReais: 20,
      quantidade: 2,
    };

    expect(planItemAddition(filled, itemB, false)).toEqual({
      kind: 'confirmation_required',
      reason: 'store_switch',
    });
    expect(planItemAddition(filled, itemB, true)).toEqual({
      kind: 'ready',
      next: {
        estabelecimentoId: 'loja-b',
        hubId: 'hub-a',
        payment: null,
        items: [{ produtoId: 'p-b', nome: 'Item B', precoSnapshotReais: 20, quantidade: 2 }],
      },
    });
  });

  it('soma a quantidade na mesma loja sem mutar o estado atual', () => {
    const itemB: AddItemInput = {
      estabelecimentoId: 'loja-b',
      produtoId: 'p-b',
      nome: 'Item B',
      precoReais: 20,
      quantidade: 2,
    };

    const sameStore = planItemAddition(
      filled,
      { ...itemB, estabelecimentoId: 'loja-a', produtoId: 'p-a' },
      false,
    );

    expect(sameStore).toMatchObject({ kind: 'ready', next: { items: [{ produtoId: 'p-a', quantidade: 3 }] } });
    expect(filled.items).toEqual([
      { produtoId: 'p-a', nome: 'Item A', precoSnapshotReais: 10, quantidade: 1 },
    ]);
  });
});
