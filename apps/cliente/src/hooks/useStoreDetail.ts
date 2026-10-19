import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Estabelecimento } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * [IDS] CREATE — hook local para `store.port.getById`, seguindo o mesmo
 * padrão de `useHubDetail.ts` (nenhum hook de detalhe de loja em
 * `@keepit/core-data/hooks`).
 */
export function useStoreDetail(
  estabelecimentoId: string,
  options?: AsyncCallOptions,
): AsyncResourceState<Estabelecimento | null> {
  const client = getDataClient();

  return useAsyncResource<Estabelecimento | null>(
    () => client.store.getById(estabelecimentoId, options),
    null,
    [estabelecimentoId, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}
