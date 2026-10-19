import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Pedido } from '@keepit/core-data';
import { businessConfig } from '@keepit/config';

import {
  existePedidoEmAndamento,
  startPedidoPolling,
  type AppStateStatusLike,
  type AppStateSubscriptionLike,
} from './pedidoPolling';

/**
 * Story 6.13 (AC1-AC4, AC6). `startPedidoPolling` é testado com um
 * `AppState`/`setInterval` FAKE injetado via `deps` (ver "[GAP DE INFRA]"
 * no header de `pedidoPolling.ts`) — o hook real (`usePedidosMine.ts`)
 * conecta este módulo ao `AppState` de `react-native`, fora do escopo
 * testável em `.test.ts` puro (`vitest` ambiente `node`).
 */
function fakeAppState(initial: AppStateStatusLike = 'active') {
  let current = initial;
  let listener: ((status: AppStateStatusLike) => void) | null = null;
  let removed = false;

  return {
    getAppState: () => current,
    addAppStateListener: (callback: (status: AppStateStatusLike) => void): AppStateSubscriptionLike => {
      listener = callback;
      return {
        remove: () => {
          removed = true;
        },
      };
    },
    emit: (status: AppStateStatusLike) => {
      current = status;
      listener?.(status);
    },
    isRemoved: () => removed,
  };
}

describe('startPedidoPolling (Story 6.13, AC1-AC4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispara onTick a cada intervalMs enquanto o app está em foreground (AC1)', () => {
    const onTick = vi.fn();
    const appState = fakeAppState('active');

    const controller = startPedidoPolling(onTick, {
      setInterval,
      clearInterval,
      getAppState: appState.getAppState,
      addAppStateListener: appState.addAppStateListener,
      intervalMs: 15_000,
    });

    expect(onTick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15_000);
    expect(onTick).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15_000);
    expect(onTick).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(45_000);
    expect(onTick).toHaveBeenCalledTimes(5);

    controller.stop();
  });

  it('usa businessConfig.pedidoPollingIntervalSeg como default quando intervalMs não é passado (AC2)', () => {
    const onTick = vi.fn();
    const appState = fakeAppState('active');

    const controller = startPedidoPolling(onTick, {
      setInterval,
      clearInterval,
      getAppState: appState.getAppState,
      addAppStateListener: appState.addAppStateListener,
    });

    vi.advanceTimersByTime(businessConfig.pedidoPollingIntervalSeg * 1000 - 1);
    expect(onTick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenCalledTimes(1);

    controller.stop();
  });

  it('pausa o intervalo quando o AppState reporta background — nenhum tick mesmo avançando o tempo (AC4)', () => {
    const onTick = vi.fn();
    const appState = fakeAppState('active');

    const controller = startPedidoPolling(onTick, {
      setInterval,
      clearInterval,
      getAppState: appState.getAppState,
      addAppStateListener: appState.addAppStateListener,
      intervalMs: 15_000,
    });

    vi.advanceTimersByTime(15_000);
    expect(onTick).toHaveBeenCalledTimes(1);

    appState.emit('background');
    onTick.mockClear();

    vi.advanceTimersByTime(60_000);
    expect(onTick).not.toHaveBeenCalled();

    controller.stop();
  });

  it('retoma com um refresh IMEDIATO ao voltar para active, e volta a disparar no intervalo (AC4)', () => {
    const onTick = vi.fn();
    const appState = fakeAppState('active');

    const controller = startPedidoPolling(onTick, {
      setInterval,
      clearInterval,
      getAppState: appState.getAppState,
      addAppStateListener: appState.addAppStateListener,
      intervalMs: 15_000,
    });

    appState.emit('background');
    onTick.mockClear();

    appState.emit('active');
    // Refresh imediato — sem precisar avançar o relógio.
    expect(onTick).toHaveBeenCalledTimes(1);

    onTick.mockClear();
    vi.advanceTimersByTime(15_000);
    expect(onTick).toHaveBeenCalledTimes(1);

    controller.stop();
  });

  it('não inicia o intervalo se o app já começa em background — só ao primeiro "active"', () => {
    const onTick = vi.fn();
    const appState = fakeAppState('background');

    const controller = startPedidoPolling(onTick, {
      setInterval,
      clearInterval,
      getAppState: appState.getAppState,
      addAppStateListener: appState.addAppStateListener,
      intervalMs: 15_000,
    });

    vi.advanceTimersByTime(60_000);
    expect(onTick).not.toHaveBeenCalled();

    appState.emit('active');
    expect(onTick).toHaveBeenCalledTimes(1);

    controller.stop();
  });

  it('stop() limpa o intervalo e remove o listener de AppState — nenhum tick depois disso (cleanup)', () => {
    const onTick = vi.fn();
    const appState = fakeAppState('active');

    const controller = startPedidoPolling(onTick, {
      setInterval,
      clearInterval,
      getAppState: appState.getAppState,
      addAppStateListener: appState.addAppStateListener,
      intervalMs: 15_000,
    });

    controller.stop();
    expect(appState.isRemoved()).toBe(true);

    onTick.mockClear();
    vi.advanceTimersByTime(60_000);
    expect(onTick).not.toHaveBeenCalled();
  });
});

describe('existePedidoEmAndamento (Story 6.13, AC1/AC3)', () => {
  function pedidoComStatus(status: Pedido['status']): Pedido {
    return { status } as Pedido;
  }

  it('true quando existe ao menos um pedido em status não-terminal', () => {
    expect(existePedidoEmAndamento([pedidoComStatus('saindo_hub'), pedidoComStatus('entregue')])).toBe(true);
  });

  it('false quando todos os pedidos estão em status terminal — condição de parada do polling (AC3)', () => {
    expect(existePedidoEmAndamento([pedidoComStatus('entregue'), pedidoComStatus('cancelado')])).toBe(false);
  });

  it('false para lista vazia', () => {
    expect(existePedidoEmAndamento([])).toBe(false);
  });
});
