import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Hub } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * [IDS] CREATE — `@keepit/core-data/hooks` (Story 0.2) só exporta `useHubs()`
 * (lista), sem um hook de detalhe por id. Segue o mesmo padrão de
 * `apps/cliente/src/hooks/useCurrentCliente.ts` (Story 0.4) e
 * `apps/admin/src/hooks/useAdminHubs.ts` (Story 0.12): hook local que
 * compõe `useAsyncResource` (já exportado por `@keepit/core-data/hooks`)
 * com `getDataClient().hub`, sem tocar `packages/core-data` (fora do escopo
 * desta story).
 */
export function useHubDetail(hubId: string, options?: AsyncCallOptions): AsyncResourceState<Hub | null> {
  const client = getDataClient();

  return useAsyncResource<Hub | null>(
    () => client.hub.getById(hubId, options),
    null,
    [hubId, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}
