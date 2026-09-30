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

it.each(['pix','cartao'] as const)('retoma pagamento %s pendente usando somente pedidoId', (forma_pagamento) => {
  expect(getPedidoNavigationTarget({ ...pedido('aguardando_pagamento'), forma_pagamento })).toEqual({ navigator: 'root', route: forma_pagamento === 'pix' ? 'ModalPagamentoPix' : 'ModalProcessandoPagamento', params: { pedidoId: 'pedido-aguardando_pagamento' } });
});
