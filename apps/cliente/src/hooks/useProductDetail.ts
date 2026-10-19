import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Produto } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * [IDS] CREATE — hook local para `product.port.getById` (Task 4, AC2).
 */
export function useProductDetail(produtoId: string, options?: AsyncCallOptions): AsyncResourceState<Produto | null> {
  const client = getDataClient();

  return useAsyncResource<Produto | null>(
    () => client.product.getById(produtoId, options),
    null,
    [produtoId, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}
