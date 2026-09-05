import type { Pedido } from '@keepit/core-data';

import { isPedidoConcluido } from './pedidoStatus';

export type PedidoNavigationTarget =
  | {
      navigator: 'root';
      route: 'ModalConfirmarPin';
      params: { pedidoId: string };
    }
  | {
      navigator: 'pedidos';
      route: 'Recibo';
      params: { pedidoId: string };
    };

export function getPedidoNavigationTarget(pedido: Pedido): PedidoNavigationTarget {
  if (isPedidoConcluido(pedido.status)) {
    return {
      navigator: 'pedidos',
      route: 'Recibo',
      params: { pedidoId: pedido.id },
    };
  }

  return {
    navigator: 'root',
    route: 'ModalConfirmarPin',
    params: { pedidoId: pedido.id },
  };
}
