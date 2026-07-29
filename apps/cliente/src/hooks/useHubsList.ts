import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Hub } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * [IDS] ADAPT — `@keepit/core-data/hooks` já exporta `useHubs()`, mas sem
 * aceitar `AsyncCallOptions` (necessário na Home para exercitar
 * loading/vazio/erro via `DevStateToggle` — AC3 da Story 0.5). Mesmo padrão
 * de `apps/admin/src/hooks/useAdminHubs.ts`.
 */
export function useHubsList(options?: AsyncCallOptions): AsyncResourceState<Hub[]> {
  const client = getDataClient();

  return useAsyncResource<Hub[]>(
    () => client.hub.listNearby(options),
    [],
    [options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}
