import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Produto } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * [IDS] CREATE — hook local para `product.port.list(estabelecimentoId)`
 * (catálogo da loja — Task 3, AC2). Nenhum hook de catálogo existe em
 * `@keepit/core-data/hooks`.
 */
export function useCatalogo(estabelecimentoId: string, options?: AsyncCallOptions): AsyncResourceState<Produto[]> {
  const client = getDataClient();

  return useAsyncResource<Produto[]>(
    () => client.product.list(estabelecimentoId, options),
    [],
    [estabelecimentoId, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}
