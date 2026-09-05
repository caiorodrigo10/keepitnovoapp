import { describe, expect, it, vi } from 'vitest';

import type { DataClient, Pedido } from '@keepit/core-data';

import {
  advanceOrderForQa,
  canRunQaOrderOutcome,
  getNextQaOrderAction,
  runQaOrderOutcome,
} from './qaOrderActions';

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

describe('runQaOrderOutcome', () => {
  it('recusa somente enquanto o pedido aguarda aceite', async () => {
    const refuse = vi.fn().mockResolvedValue(pedido('recusado'));
    const cancel = vi.fn();
    const client = { order: { refuse, cancel } } as unknown as DataClient;

    await expect(runQaOrderOutcome(client, pedido('aguardando_aceite'), 'refuse')).resolves.toEqual(
      pedido('recusado'),
    );
    await expect(runQaOrderOutcome(client, pedido('aceito'), 'refuse')).resolves.toBeNull();

    expect(refuse).toHaveBeenCalledOnce();
    expect(refuse).toHaveBeenCalledWith('pedido-qa', 'Recusa acionada pelo Painel QA');
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each(['aguardando_pagamento', 'aguardando_aceite', 'aceito', 'em_preparo'] as const)(
    'cancela por meio da port antes de saindo_hub em %s',
    async (status) => {
      const cancel = vi.fn().mockResolvedValue(pedido('cancelado'));
      const client = { order: { cancel } } as unknown as DataClient;

      await expect(runQaOrderOutcome(client, pedido(status), 'cancel')).resolves.toEqual(
        pedido('cancelado'),
      );

      expect(cancel).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledWith('pedido-qa', 'Cancelamento acionado pelo Painel QA');
    },
  );

  it.each([
    ['saindo_hub', 'cancel'],
    ['no_hub', 'cancel'],
    ['no_hub', 'refuse'],
    ['entregue', 'cancel'],
    ['cancelado', 'refuse'],
    ['recusado', 'cancel'],
  ] as const)('não contorna a máquina em %s com outcome %s', async (status, outcome) => {
    const order = { cancel: vi.fn(), refuse: vi.fn() };

    await expect(
      runQaOrderOutcome({ order } as unknown as DataClient, pedido(status), outcome),
    ).resolves.toBeNull();

    expect(order.cancel).not.toHaveBeenCalled();
    expect(order.refuse).not.toHaveBeenCalled();
    expect(canRunQaOrderOutcome(pedido(status), outcome)).toBe(false);
  });
});
