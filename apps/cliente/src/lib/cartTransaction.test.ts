import { describe, expect, it, vi } from 'vitest';

import type { CartOrderState } from './cartRules';
import { executeCartTransition } from './cartTransaction';

const filled: CartOrderState = {
  estabelecimentoId: 'loja-a',
  hubId: 'hub-a',
  payment: { type: 'pix' },
  items: [{ produtoId: 'p-a', nome: 'Item A', precoSnapshotReais: 10, quantidade: 1 }],
};

describe('executeCartTransition (Story 12.9)', () => {
  it('só devolve o próximo estado depois da persistência', async () => {
    const persist = vi.fn().mockResolvedValue({ status: 'saved' });
    const next: CartOrderState = {
      ...filled,
      hubId: 'hub-b',
      estabelecimentoId: null,
      items: [],
      payment: null,
    };

    await expect(executeCartTransition(filled, { kind: 'ready', next }, persist)).resolves.toEqual({
      status: 'committed',
      state: next,
    });
    expect(persist).toHaveBeenCalledWith(next);
  });

  it('falha de persistência devolve exatamente o snapshot anterior', async () => {
    const persist = vi.fn().mockResolvedValue({ status: 'failed' });
    const next: CartOrderState = {
      ...filled,
      hubId: 'hub-b',
      estabelecimentoId: null,
      items: [],
      payment: null,
    };

    await expect(executeCartTransition(filled, { kind: 'ready', next }, persist)).resolves.toEqual({
      status: 'persistence_error',
      state: filled,
    });
  });

  it('devolve confirmação e bloqueio sem tentar persistir', async () => {
    const persist = vi.fn().mockResolvedValue({ status: 'saved' });

    await expect(
      executeCartTransition(filled, { kind: 'confirmation_required', reason: 'store_switch' }, persist),
    ).resolves.toEqual({ status: 'confirmation_required', reason: 'store_switch' });
    await expect(
      executeCartTransition(filled, { kind: 'blocked', reason: 'hub_unavailable' }, persist),
    ).resolves.toEqual({ status: 'blocked', reason: 'hub_unavailable' });
    expect(persist).not.toHaveBeenCalled();
  });

  it('devolve o snapshot atual quando a transição não muda nada', async () => {
    const persist = vi.fn().mockResolvedValue({ status: 'saved' });

    await expect(executeCartTransition(filled, { kind: 'unchanged' }, persist)).resolves.toEqual({
      status: 'unchanged',
      state: filled,
    });
    expect(persist).not.toHaveBeenCalled();
  });
});
