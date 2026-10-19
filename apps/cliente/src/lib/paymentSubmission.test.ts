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

it('captura o cartão salvo antes de limpar o carrinho e preserva-o ao repetir só a limpeza', async () => {
  const createOrder = vi.fn().mockResolvedValue({ id: 'pedido-1' });
  const clearOrder = vi
    .fn()
    .mockResolvedValueOnce({ status: 'persistence_error', state: filled })
    .mockResolvedValueOnce({ status: 'committed', state: empty });
  const controller = createPaymentSubmissionController();

  await expect(controller.submit({ paymentType: 'cartao', cartaoSalvoId: 'card-escolhido', createOrder, clearOrder })).resolves.toEqual({
    status: 'cleanup_failed',
    target: { pedidoId: 'pedido-1', paymentType: 'cartao', cartaoSalvoId: 'card-escolhido' },
  });
  await expect(controller.submit({ paymentType: 'cartao', cartaoSalvoId: 'outro-cartao', createOrder, clearOrder })).resolves.toEqual({
    status: 'ready',
    target: { pedidoId: 'pedido-1', paymentType: 'cartao', cartaoSalvoId: 'card-escolhido' },
  });

  expect(createOrder).toHaveBeenCalledOnce();
});

it('duplo toque enquanto cria pedido não cria duplicata', async () => {
  let release!: (value: { id: string }) => void;
  const createOrder = vi.fn(() => new Promise<{ id: string }>((resolve) => { release = resolve; }));
  const clearOrder = vi.fn().mockResolvedValue({ status: 'committed', state: empty });
  const controller = createPaymentSubmissionController();

  const first = controller.submit({ paymentType: 'pix', createOrder, clearOrder });
  await expect(controller.submit({ paymentType: 'pix', createOrder, clearOrder })).resolves.toEqual({ status: 'busy' });
  release({ id: 'pedido-unico' });
  await expect(first).resolves.toEqual({ status: 'ready', target: { pedidoId: 'pedido-unico', paymentType: 'pix' } });
  expect(createOrder).toHaveBeenCalledOnce();
});
