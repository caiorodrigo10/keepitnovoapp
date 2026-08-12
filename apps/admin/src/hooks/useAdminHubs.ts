'use client';

import { useCallback, useState } from 'react';

import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Hub } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * Hook local do Admin (Story 0.12) para a listagem de hubs, com `refresh()`
 * para re-buscar após o CRUD de hub (create/update/soft-delete/reativar).
 *
 * [AUTO-DECISION] Story 4.1 (AC1) — `client.admin.hubsCrud.list()`, NÃO
 * `client.hub.listNearby()` → (reason: `hub.listNearby` é a leitura pública
 * de Descoberta (Épico 5) e filtra `ativo = true` por design; o Admin
 * precisa ver E REATIVAR hubs desativados, que `listNearby` esconderia. Ver
 * JSDoc de `AdminPort.hubsCrud.list` em `packages/core-data/src/ports/
 * admin.port.ts` para o racional completo.
 *
 * [IDS] REUSE parcial: `@keepit/core-data/hooks` já exporta `useHubs()`, mas
 * sem mecanismo de refetch nem a leitura administrativa — necessário aqui
 * para refletir mutações do CRUD sem depender de estado otimista manual em
 * cada tela. Ver nota de escopo em `useAdminPendingStores.ts` sobre não
 * tocar `packages/core-data`.
 */
export interface UseAdminHubsResult extends AsyncResourceState<Hub[]> {
  refresh: () => void;
}

export function useAdminHubs(options?: AsyncCallOptions): UseAdminHubsResult {
  const [refreshToken, setRefreshToken] = useState(0);
  const client = getDataClient();

  const state = useAsyncResource<Hub[]>(
    () => client.admin.hubsCrud.list(options),
    [],
    [refreshToken, options?.forceEmpty, options?.forceError, options?.delayMs],
  );

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  return { ...state, refresh };
}
