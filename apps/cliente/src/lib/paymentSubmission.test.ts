import { describe, expect, it, vi } from 'vitest';

import type { CartOrderState } from './cartRules';
import { createPaymentSubmissionController } from './paymentSubmission';

const filled: CartOrderState = {
  estabelecimentoId: 'loja-a',
  hubId: 'hub-a',
  payment: { type: 'pix' },
  items: [{ produtoId: 'p-a', nome: 'Item A', precoSnapshotReais: 10, quantidade: 1 }],
};

const empty: CartOrderState = {
  estabelecimentoId: null,
  hubId: null,
  payment: null,
  items: [],
};

describe('paymentSubmission', () => {
  it('após falha ao limpar o carrinho tenta só a limpeza, sem criar outro pedido', async () => {
    const createOrder = vi.fn().mockResolvedValue({ id: 'pedido-1' });
    const clearOrder = vi
      .fn()
      .mockResolvedValueOnce({ status: 'persistence_error', state: filled })
      .mockResolvedValueOnce({ status: 'committed', state: empty });
    const controller = createPaymentSubmissionController();

    await expect(controller.submit({ paymentType: 'pix', createOrder, clearOrder })).resolves.toEqual({
      status: 'cleanup_failed',
      target: { pedidoId: 'pedido-1', paymentType: 'pix' },
    });
    await expect(controller.submit({ paymentType: 'cartao', createOrder, clearOrder })).resolves.toEqual({
      status: 'ready',
      target: { pedidoId: 'pedido-1', paymentType: 'pix' },
    });

    expect(createOrder).toHaveBeenCalledOnce();
    expect(clearOrder).toHaveBeenCalledTimes(2);
  });
});
