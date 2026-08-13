import type { Pedido } from '@keepit/core-data';
import { businessConfig } from '@keepit/config';

import { isPedidoEmAndamento } from './pedidoStatus';

/**
 * [IDS] CREATE — Story 6.13 (AC1-AC4, AC6). Nenhum scheduler de polling
 * existia em `apps/cliente` antes desta story.
 *
 * **[GAP DE INFRA, já documentado nas Stories 2.1/5.4/5.6/6.1]** `apps/cliente`
 * não tem `@testing-library/react-native`/harness de teste de hook React
 * (`vitest` roda em ambiente `node`, `usePedidosMine`/`AppState` não podem
 * ser renderizados/testados diretamente). Mesmo padrão de mitigação já
 * usado nessas stories: a lógica de start/stop/pausa/retomada fica aqui,
 * num módulo PURO (sem importar `react`/`react-native`), testável com fake
 * timers e um `AppState` fake injetado via `deps` (`pedidoPolling.test.ts`).
 * `usePedidosMine.ts` só conecta este módulo ao `AppState`/`setInterval`
 * reais do runtime e ao `refresh()` do próprio hook — nenhuma lógica de
 * agendamento fica no componente/hook.
 */

/** Subconjunto de `AppStateStatus` (`react-native`) que este módulo entende — evita importar `react-native` aqui. */
export type AppStateStatusLike = 'active' | 'background' | 'inactive' | 'extension' | 'unknown';

export interface AppStateSubscriptionLike {
  remove: () => void;
}

export interface PedidoPollingDeps {
  /** Injeta `setInterval` real (produção) ou fake de teste (`vi.useFakeTimers()`). */
  setInterval: (handler: () => void, timeoutMs: number) => ReturnType<typeof setInterval>;
  /** Injeta `clearInterval` real (produção) ou fake de teste. */
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
  /** Injeta `AppState.currentState` (produção) ou um fake de teste. */
  getAppState: () => AppStateStatusLike;
  /** Injeta `AppState.addEventListener('change', cb)` (produção) ou um fake de teste. */
  addAppStateListener: (callback: (status: AppStateStatusLike) => void) => AppStateSubscriptionLike;
  /** Override do intervalo — só para teste. Produção sempre usa `businessConfig.pedidoPollingIntervalSeg`. */
  intervalMs?: number;
}

export interface PedidoPollingController {
  /** Para o intervalo (se ativo) e remove o listener de `AppState` — chamar no cleanup do `useEffect`. */
  stop: () => void;
}

/**
 * Inicia o polling: dispara `onTick` a cada `intervalMs`
 * (`businessConfig.pedidoPollingIntervalSeg * 1000` por padrão, AC2)
 * enquanto o app está em foreground; pausa o intervalo quando o app vai a
 * background (AC4) e retoma — com um `onTick` IMEDIATO — ao voltar para
 * `active` (AC4).
 *
 * Este módulo não sabe nada sobre pedidos/status — quem chama decide
 * QUANDO iniciar/parar o polling (via `useEffect` gated por
 * `existePedidoEmAndamento`, AC1/AC3), chamando `stop()` no cleanup.
 */
export function startPedidoPolling(onTick: () => void, deps: PedidoPollingDeps): PedidoPollingController {
  const intervalMs = deps.intervalMs ?? businessConfig.pedidoPollingIntervalSeg * 1000;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const startInterval = (): void => {
    if (intervalId !== null) {
      return;
    }
    intervalId = deps.setInterval(onTick, intervalMs);
  };

  const stopInterval = (): void => {
    if (intervalId !== null) {
      deps.clearInterval(intervalId);
      intervalId = null;
    }
  };

  const handleAppStateChange = (nextStatus: AppStateStatusLike): void => {
    if (nextStatus === 'active') {
      onTick(); // AC4: refresh imediato ao voltar ao primeiro plano.
      startInterval();
    } else {
      stopInterval();
    }
  };

  if (deps.getAppState() === 'active') {
    startInterval();
  }

  const subscription = deps.addAppStateListener(handleAppStateChange);

  return {
    stop: () => {
      stopInterval();
      subscription.remove();
    },
  };
}

/**
 * AC1/AC3: condição pura que decide se o polling deve estar ativo — `true`
 * enquanto existir ao menos um pedido do cliente em status não-terminal.
 * Extraída como função pura (mesmo racional do resto deste módulo) para
 * poder ser testada isoladamente, sem depender do hook/`useEffect`.
 */
export function existePedidoEmAndamento(pedidos: Pedido[]): boolean {
  return pedidos.some((pedido) => isPedidoEmAndamento(pedido.status));
}
