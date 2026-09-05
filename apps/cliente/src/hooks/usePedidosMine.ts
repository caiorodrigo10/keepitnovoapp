import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { existePedidoEmAndamento, startPedidoPolling } from '../lib/pedidoPolling';
import {
  getOrdersResource,
  invalidatePedidos,
  type OrdersSnapshot,
} from '../lib/ordersResource';

const EMPTY_ORDERS_SNAPSHOT: OrdersSnapshot = { data: [], loading: false, error: null };

/**
 * Snapshot canônico compartilhado entre todas as telas de pedidos. Estados
 * simulados de QA são derivados apenas na apresentação e nunca entram nesta
 * coleção.
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
export function usePedidosMine(clienteId: string | null): OrdersSnapshot & {
  refresh: () => void;
} {
  const resource = getOrdersResource();
  const subscribe = useCallback(
    (listener: () => void) => (clienteId ? resource.subscribe(clienteId, listener) : () => undefined),
    [clienteId, resource],
  );
  const getSnapshot = useCallback(
    () => (clienteId ? resource.getSnapshot(clienteId) : EMPTY_ORDERS_SNAPSHOT),
    [clienteId, resource],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (clienteId) {
      void resource.load(clienteId);
    }
  }, [clienteId, resource]);

  const refresh = useCallback(() => {
    if (clienteId) {
      void invalidatePedidos(clienteId);
    }
  }, [clienteId]);

  const temPedidoEmAndamento = existePedidoEmAndamento(state.data);

  useEffect(() => {
    if (!temPedidoEmAndamento) {
      return undefined;
    }

    const controller = startPedidoPolling(
      () => {
        if (clienteId) {
          void invalidatePedidos(clienteId);
        }
      },
      {
        // [FIX] Passar `setInterval`/`clearInterval` soltos faz `deps.setInterval(...)`
        // rodar com `this = deps` no web (react-native-web) — o browser exige
        // `this === window` e lança "Illegal invocation". Envolver em arrow que
        // chama o global diretamente resolve no web sem alterar o comportamento
        // no nativo (RN não tem essa checagem de `this`).
        setInterval: (handler, ms) => setInterval(handler, ms),
        clearInterval: (id) => clearInterval(id),
        getAppState: () => AppState.currentState,
        addAppStateListener: (callback) => AppState.addEventListener('change', callback),
      },
    );

    return () => controller.stop();
  }, [clienteId, temPedidoEmAndamento]);

  return { ...state, refresh };
}
