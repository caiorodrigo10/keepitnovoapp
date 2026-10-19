import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, LojaEstado } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * [IDS] CREATE — hook local para `store.port.getState` (AC1 — Aberta /
 * Fechada / Pausada). `initialValue: null` distingue "ainda carregando" de
 * um estado real, para a tela não piscar "Fechada" antes da resposta.
 */
export function useLojaEstado(
  estabelecimentoId: string,
  options?: AsyncCallOptions,
): AsyncResourceState<LojaEstado | null> {
  const client = getDataClient();

  return useAsyncResource<LojaEstado | null>(
    () => client.store.getState(estabelecimentoId, options),
    null,
    [estabelecimentoId, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}
