import { describe, expect, it, vi } from 'vitest';

import type { OrderChangeEvent, Pedido, PedidoStatus } from '@keepit/core-data';

import { createOrdersResource } from './ordersResource';

const pedido = (status: PedidoStatus, clienteId = 'cliente-ana'): Pedido =>
  ({ id: `pedido-${status}`, cliente_id: clienteId, status }) as Pedido;

describe('createOrdersResource', () => {
  it('compartilha uma leitura e publica o mesmo snapshot a todos os consumidores', async () => {
    const fetchMine = vi.fn().mockResolvedValue([pedido('aceito')]);
    const resource = createOrdersResource(fetchMine);
    const first = vi.fn();
    const second = vi.fn();
    resource.subscribe('cliente-ana', first);
    resource.subscribe('cliente-ana', second);

    await Promise.all([resource.load('cliente-ana'), resource.load('cliente-ana')]);

    expect(fetchMine).toHaveBeenCalledTimes(1);
    expect(fetchMine).toHaveBeenCalledWith('cliente-ana');
    expect(resource.getSnapshot('cliente-ana')).toMatchObject({
      data: [expect.objectContaining({ status: 'aceito' })],
      loading: false,
      error: null,
    });
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it('invalida após mudança e ignora resposta antiga que chega fora de ordem', async () => {
    let resolveFirst!: (orders: Pedido[]) => void;
    let resolveSecond!: (orders: Pedido[]) => void;
    const fetchMine = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Pedido[]>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise<Pedido[]>((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const resource = createOrdersResource(fetchMine);
    const firstLoad = resource.load('cliente-ana');
    const secondLoad = resource.invalidate('cliente-ana');

    resolveSecond([pedido('em_preparo')]);
    await secondLoad;
    resolveFirst([pedido('aceito')]);
    await firstLoad;

    expect(resource.getSnapshot('cliente-ana').data[0]?.status).toBe('em_preparo');
  });

  it('publica o erro da leitura no snapshot', async () => {
    const failure = new Error('falha ao listar pedidos');
    const resource = createOrdersResource(vi.fn().mockRejectedValue(failure));

    await resource.load('cliente-ana');

    expect(resource.getSnapshot('cliente-ana')).toEqual({
      data: [],
      loading: false,
      error: failure,
    });
  });

  it('clear publica um snapshot vazio', async () => {
    const resource = createOrdersResource(vi.fn().mockResolvedValue([pedido('aceito')]));
    const listener = vi.fn();
    resource.subscribe('cliente-ana', listener);
    await resource.load('cliente-ana');
    listener.mockClear();

    resource.clear('cliente-ana');

    expect(resource.getSnapshot('cliente-ana')).toEqual({ data: [], loading: false, error: null });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('invalida somente o cliente informado por subscribeChanges', async () => {
    let notifyChange!: (event: OrderChangeEvent) => void;
    const subscribeChanges = vi.fn((listener: (event: OrderChangeEvent) => void) => {
      notifyChange = listener;
      return vi.fn();
    });
    const fetchMine = vi.fn(async (clienteId: string) => [pedido('aceito', clienteId)]);
    const resource = createOrdersResource(fetchMine, subscribeChanges);
    await Promise.all([resource.load('cliente-ana'), resource.load('cliente-bia')]);

    notifyChange({ clienteId: 'cliente-ana', pedidoId: 'pedido-aceito', reason: 'mutation' });
    await vi.waitFor(() => expect(fetchMine).toHaveBeenCalledTimes(3));

    expect(fetchMine.mock.calls).toEqual([
      ['cliente-ana'],
      ['cliente-bia'],
      ['cliente-ana'],
    ]);
  });
});
