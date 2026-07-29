import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Estabelecimento } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * [IDS] ADAPT — mesma razão de `useHubsList.ts`: `useStores(hubId)` de
 * `@keepit/core-data/hooks` não aceita `AsyncCallOptions`, necessário para
 * exercitar loading/vazio/erro (AC3) na Home, Hub e telas de busca.
 */
export function useStoresList(hubId: string, options?: AsyncCallOptions): AsyncResourceState<Estabelecimento[]> {
  const client = getDataClient();

  return useAsyncResource<Estabelecimento[]>(
    () => client.store.listByHub(hubId, options),
    [],
    [hubId, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}
