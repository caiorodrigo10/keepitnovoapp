'use client';

import { useCallback, useState } from 'react';

import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Estabelecimento } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * Hook local do Admin (Story 0.12) para `admin.port.pendingStores()`.
 *
 * [IDS] Decisão: hooks de domínio de `@keepit/core-data` normalmente vivem
 * DENTRO do pacote (ver `packages/core-data/src/hooks/useHubs.ts`), mas esta
 * story tem escopo estritamente limitado a `apps/admin/` (mission constraint
 * — outro @dev trabalha em paralelo em `packages/*`). Composição local sobre
 * os building blocks já exportados por `@keepit/core-data` (`getDataClient`,
 * `useAsyncResource`) evita duplicar lógica de port/mock e mantém a port
 * como única fonte de verdade.
 */
export interface UseAdminPendingStoresResult extends AsyncResourceState<Estabelecimento[]> {
  /** Reexecuta `pendingStores()` — usado após aprovar/rejeitar um lojista. */
  refresh: () => void;
}

export function useAdminPendingStores(options?: AsyncCallOptions): UseAdminPendingStoresResult {
  const [refreshToken, setRefreshToken] = useState(0);
  const client = getDataClient();

  const state = useAsyncResource<Estabelecimento[]>(
    () => client.admin.pendingStores(options),
    [],
    [refreshToken, options?.forceEmpty, options?.forceError, options?.delayMs],
  );

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  return { ...state, refresh };
}
