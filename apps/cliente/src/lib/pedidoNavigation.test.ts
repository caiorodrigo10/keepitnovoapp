import { describe, expect, it } from 'vitest';

import type { Pedido, PedidoStatus } from '@keepit/core-data';

import { getPedidoNavigationTarget } from './pedidoNavigation';

const pedido = (status: PedidoStatus): Pedido => ({
  id: `pedido-${status}`,
  cliente_id: 'cliente-ana',
  status,
}) as Pedido;

describe('getPedidoNavigationTarget', () => {
  it('abre o acompanhamento para pedido em andamento', () => {
    expect(getPedidoNavigationTarget(pedido('no_hub'))).toEqual({
      navigator: 'root',
      route: 'ModalConfirmarPin',
      params: { pedidoId: 'pedido-no_hub' },
    });
  });

  it.each(['entregue', 'recusado'] as const)('abre o recibo para pedido concluído (%s)', (status) => {
    expect(getPedidoNavigationTarget(pedido(status))).toEqual({
      navigator: 'pedidos',
      route: 'Recibo',
      params: { pedidoId: `pedido-${status}` },
    });
  });
});
