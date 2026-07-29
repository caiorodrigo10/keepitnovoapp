import { useCallback, useState } from 'react';

import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Pedido } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * [IDS] CREATE — `useOrders(clienteId)` de `@keepit/core-data/hooks` (Story
 * 0.2) NÃO aceita `AsyncCallOptions` (assinatura fixa, sem 2º parâmetro),
 * então não dá para injetar `forceEmpty`/`forceError`/`delayMs` exigidos
 * pelo AC3 (loading/vazio/erro) via aquele hook. Mesmo padrão de
 * `useHubDetail`/`useCurrentCliente` (Stories 0.4/0.5): hook local que
 * compõe `useAsyncResource` (já exportado por `@keepit/core-data/hooks`)
 * com `getDataClient().order`, sem tocar `packages/core-data`.
 *
 * Expõe `refresh()` (via `refreshKey`) para recarregar a lista após
 * mutações reais na port (`accept`/`confirmPin`/`cancel`) chamadas por
 * outras telas desta story.
 */
export function usePedidosMine(clienteId: string | null, options?: AsyncCallOptions): AsyncResourceState<Pedido[]> & {
  refresh: () => void;
} {
  const client = getDataClient();
  const [refreshKey, setRefreshKey] = useState(0);

  const state = useAsyncResource<Pedido[]>(
    () => (clienteId ? client.order.listMine(clienteId, options) : Promise.resolve([])),
    [],
    [clienteId, options?.forceEmpty, options?.forceError, options?.delayMs, refreshKey],
  );

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  return { ...state, refresh };
}
