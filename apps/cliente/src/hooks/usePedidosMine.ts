import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getDataClient } from '@keepit/core-data';
import type { AsyncCallOptions, Pedido } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

import { existePedidoEmAndamento, startPedidoPolling } from '../lib/pedidoPolling';

/**
 * [IDS] CREATE — `useOrders(clienteId)` de `@keepit/core-data/hooks` (Story
 * 0.2) NÃO aceita `AsyncCallOptions` (assinatura fixa, sem 2º parâmetro),
 * então não dá para injetar `forceEmpty`/`forceError`/`delayMs` exigidos
 * pelo AC3 (loading/vazio/erro) via aquele hook. Mesmo padrão de
 * `useHubDetail`/`useCurrentCliente` (Stories 0.4/0.5): hook local que
 * compõe `useAsyncResource` (já exportado por `@keepit/core-data/hooks`)
 * com `getDataClient().order`, sem tocar `packages/core-data`.
 *
 * Expõe `refresh()` (via `refreshKey`) para recarregar a lista após
 * mutações reais na port (`accept`/`confirmPin`/`cancel`) chamadas por
 * outras telas desta story.
 *
 * **Story 6.13 (AC1-AC5).** Além do `refresh()` manual, este hook passa a
 * reler `listMine` periodicamente (`startPedidoPolling`,
 * `apps/cliente/src/lib/pedidoPolling.ts`) enquanto existir ao menos um
 * pedido em `isPedidoEmAndamento` (AC1) — pausando em background e
 * retomando com refresh imediato ao voltar ao primeiro plano (AC4), e
 * parando sozinho quando todos os pedidos ficam terminais (AC3, cleanup do
 * `useEffect` abaixo). Aditivo ao `refresh()` manual já existente — nenhuma
 * tela nova, nenhuma mudança de layout (AC5); `ModalConfirmarPin`,
 * `MeusPedidos` e `Recibo` herdam o comportamento automaticamente por
 * compartilharem este hook (direto ou via `usePedidoDetail`).
 */
export function usePedidosMine(clienteId: string | null, options?: AsyncCallOptions): AsyncResourceState<Pedido[]> & {
  refresh: () => void;
} {
  const client = getDataClient();
  const [refreshKey, setRefreshKey] = useState(0);

  const state = useAsyncResource<Pedido[]>(
    () => (clienteId ? client.order.listMine(clienteId, options) : Promise.resolve([])),
    [],
    [clienteId, options?.forceEmpty, options?.forceError, options?.delayMs, refreshKey],
  );

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  // Evita recriar o efeito de polling a cada render só porque `refresh`
  // mudou de identidade — o `useEffect` abaixo só precisa reagir a
  // `temPedidoEmAndamento` (AC1/AC3), nunca reiniciar o intervalo por causa
  // de uma nova referência de função.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const temPedidoEmAndamento = existePedidoEmAndamento(state.data);

  useEffect(() => {
    if (!temPedidoEmAndamento) {
      return undefined;
    }

    const controller = startPedidoPolling(() => refreshRef.current(), {
      setInterval,
      clearInterval,
      getAppState: () => AppState.currentState,
      addAppStateListener: (callback) => AppState.addEventListener('change', callback),
    });

    return () => controller.stop();
  }, [temPedidoEmAndamento]);

  return { ...state, refresh };
}
