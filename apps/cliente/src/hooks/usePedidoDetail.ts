import { useMemo } from 'react';

import type { AsyncCallOptions, Pedido } from '@keepit/core-data';

import { isPedidoEmAndamento } from '../lib/pedidoStatus';
import { usePedidosMine } from './usePedidosMine';

export interface PedidoDetailState {
  data: Pedido | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * [IDS] CREATE — `OrderPort` (Story 0.2) não tem `getById(pedidoId)` (só
 * `listMine`), então toda tela de detalhe desta story (PIN, Recibo,
 * Cheguei ao hub, Cancelar, Lojista não veio) precisa buscar na lista e
 * filtrar localmente. Centraliza esse filtro aqui em vez de repeti-lo em 5
 * telas.
 *
 * Sem `pedidoId` (rotas com param opcional — Task 2/3/4/6/7): cai para o
 * pedido "em andamento" mais recente do cliente (maior `numero` entre os
 * status não-terminais), mesmo padrão de fallback de `DEFAULT_HUB_ID`
 * (Story 0.6, `Checkout`).
 */
export function usePedidoDetail(
  clienteId: string | null,
  pedidoId?: string,
  options?: AsyncCallOptions,
): PedidoDetailState {
  const { data: pedidos, loading, error, refresh } = usePedidosMine(clienteId, options);

  const pedido = useMemo(() => {
    if (pedidoId) {
      return pedidos.find((p) => p.id === pedidoId) ?? null;
    }
    const emAndamento = pedidos
      .filter((p) => isPedidoEmAndamento(p.status))
      .sort((a, b) => b.numero - a.numero);
    return emAndamento[0] ?? null;
  }, [pedidos, pedidoId]);

  return { data: pedido, loading, error, refresh };
}
