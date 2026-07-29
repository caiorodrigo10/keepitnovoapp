'use client';

import { useCallback, useState } from 'react';

import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Hub } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * Hook local do Admin (Story 0.12) para `hub.port.listNearby()`, com
 * `refresh()` para re-buscar após o CRUD de hub (create/update/soft-delete).
 *
 * [IDS] REUSE parcial: `@keepit/core-data/hooks` já exporta `useHubs()`, mas
 * sem mecanismo de refetch — necessário aqui para refletir mutações do CRUD
 * sem depender de estado otimista manual em cada tela. Ver nota de escopo em
 * `useAdminPendingStores.ts` sobre não tocar `packages/core-data`.
 */
export interface UseAdminHubsResult extends AsyncResourceState<Hub[]> {
  refresh: () => void;
}

export function useAdminHubs(options?: AsyncCallOptions): UseAdminHubsResult {
  const [refreshToken, setRefreshToken] = useState(0);
  const client = getDataClient();

  const state = useAsyncResource<Hub[]>(
    () => client.hub.listNearby(options),
    [],
    [refreshToken, options?.forceEmpty, options?.forceError, options?.delayMs],
  );

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  return { ...state, refresh };
}
