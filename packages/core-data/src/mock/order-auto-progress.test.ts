import { describe, expect, it } from 'vitest';

import type { QaOrderProgressionDelaysMs, QaScenarioState } from '../ports/demo-scenario.port';
import type { Pedido, PedidoStatus } from '../ports/order.port';
import {
  reconcileAutomaticOrder,
  type OrderAutomationRuntime,
} from './order-auto-progress';

const START_MS = Date.parse('2026-09-05T10:00:00.000Z');
const delays: QaOrderProgressionDelaysMs = {
  aceito: 1_000,
  em_preparo: 1_000,
  saindo_hub: 1_000,
  no_hub: 1_000,
};

const at = (offsetMs: number) => START_MS + offsetMs;
const runtime = (): OrderAutomationRuntime => ({ enteredStatusAt: new Date(START_MS).toISOString() });
const pedido = (status: PedidoStatus) =>
  ({
    id: 'pedido-auto',
    cliente_id: 'cliente-ana',
    status,
    aceito_em: null,
    saiu_hub_em: null,
    lojista_chegou_em: null,
    tempo_estimado_min: null,
  }) as Pedido;
const qa = (configured: QaOrderProgressionDelaysMs, enabled = true): QaScenarioState => ({
  clockOffsetMs: 0,
  autoProgressOrders: enabled,
  orderProgressionDelaysMs: configured,
  simulations: {
    orders: 'normal',
    stores: 'normal',
    hubs: 'normal',
    favorites: 'normal',
    profile: 'normal',
    search: 'normal',
  },
});

describe('reconcileAutomaticOrder', () => {
  it('aplica somente as transicoes vencidas e preserva os instantes agendados', () => {
    const original = pedido('aguardando_aceite');
    const partial = reconcileAutomaticOrder(original, runtime(), qa(delays), at(2_500));

    expect(original.status).toBe('aguardando_aceite');
    expect(partial.pedido.status).toBe('em_preparo');
    expect(partial.transitions).toEqual([
      {
        from: 'aguardando_aceite',
        to: 'aceito',
        occurredAt: '2026-09-05T10:00:01.000Z',
      },
      {
        from: 'aceito',
        to: 'em_preparo',
        occurredAt: '2026-09-05T10:00:02.000Z',
      },
    ]);
    expect(partial.pedido).toMatchObject({
      aceito_em: '2026-09-05T10:00:01.000Z',
      tempo_estimado_min: 1,
    });
    expect(partial.runtime).toEqual({ enteredStatusAt: '2026-09-05T10:00:02.000Z' });

    const total = reconcileAutomaticOrder(partial.pedido, partial.runtime, qa(delays), at(5_000));

    expect(total.transitions.map(({ to }) => to)).toEqual(['saindo_hub', 'no_hub']);
    expect(total.pedido).toMatchObject({
      status: 'no_hub',
      saiu_hub_em: '2026-09-05T10:00:03.000Z',
      lojista_chegou_em: '2026-09-05T10:00:04.000Z',
    });
    expect(total.runtime).toBeNull();
  });

  it('e no-op pausado, com relogio regressivo, em no_hub ou apos reconciliacao repetida', () => {
    const paused = reconcileAutomaticOrder(
      pedido('aguardando_aceite'),
      runtime(),
      qa(delays, false),
      at(5_000),
    );
    const rolledBack = reconcileAutomaticOrder(
      pedido('aguardando_aceite'),
      runtime(),
      qa(delays),
      at(-1_000),
    );
    const terminal = reconcileAutomaticOrder(pedido('no_hub'), runtime(), qa(delays), at(9_000));
    const reconciled = reconcileAutomaticOrder(
      pedido('aguardando_aceite'),
      runtime(),
      qa(delays),
      at(5_000),
    );
    const repeated = reconcileAutomaticOrder(
      reconciled.pedido,
      reconciled.runtime,
      qa(delays),
      at(9_000),
    );

    expect(paused.transitions).toEqual([]);
    expect(rolledBack.transitions).toEqual([]);
    expect(terminal.transitions).toEqual([]);
    expect(repeated.transitions).toEqual([]);
    expect(repeated.pedido).toEqual(reconciled.pedido);
    expect(repeated.runtime).toBeNull();
  });
});
