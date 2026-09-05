import { describe, expect, it, vi } from 'vitest';

import type { DataClient, Pedido } from '@keepit/core-data';

import { advanceOrderForQa, getNextQaOrderAction } from './qaOrderActions';

function pedido(status: Pedido['status']): Pedido {
  return { id: 'pedido-qa', status, pin_texto: '7734' } as Pedido;
}

describe('getNextQaOrderAction', () => {
  it.each([
    ['aguardando_aceite', { kind: 'accept', label: 'Aceitar pedido' }],
    ['aceito', { kind: 'override', status: 'em_preparo', label: 'Em preparo' }],
    ['em_preparo', { kind: 'override', status: 'saindo_hub', label: 'Saindo para o hub' }],
    ['saindo_hub', { kind: 'override', status: 'no_hub', label: 'Pronto no hub' }],
    ['no_hub', { kind: 'confirm-pin', label: 'Confirmar entrega' }],
  ] as const)('oferece a próxima ação suportada para %s', (status, expected) => {
    expect(getNextQaOrderAction(pedido(status))).toEqual(expected);
  });

  it('não oferece ação para pedido terminal', () => {
    expect(getNextQaOrderAction(pedido('entregue'))).toBeNull();
  });

  it('não oferece aceite enquanto o pagamento ainda está pendente', () => {
    expect(getNextQaOrderAction(pedido('aguardando_pagamento'))).toBeNull();
  });
});

describe('advanceOrderForQa', () => {
  it('aceita o pedido com o tempo já usado pelo avanço dev', async () => {
    const accept = vi.fn().mockResolvedValue(pedido('aceito'));
    const client = { order: { accept } } as unknown as DataClient;

    await advanceOrderForQa(client, pedido('aguardando_aceite'));

    expect(accept).toHaveBeenCalledOnce();
    expect(accept).toHaveBeenCalledWith('pedido-qa', 15);
  });

  it('avança para o próximo status intermediário', async () => {
    const advanceStatus = vi.fn().mockResolvedValue(pedido('em_preparo'));
    const client = { order: { advanceStatus } } as unknown as DataClient;

    await advanceOrderForQa(client, pedido('aceito'));

    expect(advanceStatus).toHaveBeenCalledOnce();
    expect(advanceStatus).toHaveBeenCalledWith('pedido-qa', 'em_preparo');
  });

  it('confirma a entrega usando o PIN real do pedido', async () => {
    const confirmPin = vi.fn().mockResolvedValue(pedido('entregue'));
    const client = { order: { confirmPin } } as unknown as DataClient;

    await advanceOrderForQa(client, pedido('no_hub'));

    expect(confirmPin).toHaveBeenCalledOnce();
    expect(confirmPin).toHaveBeenCalledWith('pedido-qa', '7734');
  });

  it('não chama nenhuma port enquanto o pagamento ainda está pendente', async () => {
    const order = {
      accept: vi.fn(),
      advanceStatus: vi.fn(),
      confirmPin: vi.fn(),
    };

    await advanceOrderForQa({ order } as unknown as DataClient, pedido('aguardando_pagamento'));

    expect(order.accept).not.toHaveBeenCalled();
    expect(order.advanceStatus).not.toHaveBeenCalled();
    expect(order.confirmPin).not.toHaveBeenCalled();
  });
});
