import { useMemo, useState } from 'react';

import { getDataClient, type Pedido } from '@keepit/core-data';
import { useAsyncResource } from '@keepit/core-data/hooks';

import { isPedidoEmAndamento } from '../lib/pedidoStatus';
import { usePedidosMine } from './usePedidosMine';

export interface PedidoDetailState {
  data: Pedido | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Detalhes com `pedidoId` usam `OrderPort.getById`, sob a RLS do participante.
 * A lista compartilhada continua ativa para polling e assume a renderização
 * quando recebe uma versão mais recente do mesmo pedido.
 *
 * Sem `pedidoId` (rotas com param opcional — Task 2/3/4/6/7): cai para o
 * pedido "em andamento" mais recente do cliente (maior `numero` entre os
 * status não-terminais), mesmo padrão de fallback de `DEFAULT_HUB_ID`
 * (Story 0.6, `Checkout`).
 */
export function usePedidoDetail(
  clienteId: string | null,
  pedidoId?: string,
): PedidoDetailState {
  const { data: pedidos, loading, error, refresh } = usePedidosMine(clienteId);
  const [refreshToken, setRefreshToken] = useState(0);
  const detalhe = useAsyncResource(
    () => (clienteId && pedidoId ? getDataClient().order.getById(pedidoId) : Promise.resolve(null)),
    null,
    [clienteId, pedidoId, refreshToken],
  );

  const pedido = useMemo(() => {
    const emAndamento = pedidos
      .filter((p) => isPedidoEmAndamento(p.status))
      .sort((a, b) => b.numero - a.numero);
    return emAndamento[0] ?? null;
  }, [pedidos]);

  if (pedidoId) {
    const pedidoAtualizado = pedidos.find((item) => item.id === pedidoId) ?? detalhe.data;
    return {
      data: pedidoAtualizado,
      loading: detalhe.loading && !pedidoAtualizado,
      error: detalhe.error ?? error,
      refresh: () => {
        setRefreshToken((token) => token + 1);
        refresh();
      },
    };
  }

  return { data: pedido, loading, error, refresh };
}
