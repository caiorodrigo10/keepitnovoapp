import type { QaScenarioState } from '../ports/demo-scenario.port';
import type { Pedido, PedidoStatus } from '../ports/order.port';

const AUTO_NEXT_STATUS = {
  aguardando_aceite: 'aceito',
  aceito: 'em_preparo',
  em_preparo: 'saindo_hub',
  saindo_hub: 'no_hub',
} as const;

type AutomaticOrderStatus = keyof typeof AUTO_NEXT_STATUS;

export type OrderAutomationRuntime = { enteredStatusAt: string };

export type OrderAutoTransition = {
  from: PedidoStatus;
  to: PedidoStatus;
  occurredAt: string;
};

export function reconcileAutomaticOrder(
  pedido: Pedido,
  runtime: OrderAutomationRuntime | null,
  qa: QaScenarioState,
  nowMs = Date.now(),
): {
  pedido: Pedido;
  runtime: OrderAutomationRuntime | null;
  transitions: OrderAutoTransition[];
} {
  const reconciledPedido = { ...pedido };
  const transitions: OrderAutoTransition[] = [];
  let reconciledRuntime = runtime;

  if (
    !qa.autoProgressOrders ||
    qa.orderProgressionDelaysMs === null ||
    reconciledRuntime === null ||
    !(reconciledPedido.status in AUTO_NEXT_STATUS)
  ) {
    return { pedido: reconciledPedido, runtime: reconciledRuntime, transitions };
  }

  let enteredAtMs = Date.parse(reconciledRuntime.enteredStatusAt);
  if (nowMs < enteredAtMs) {
    return { pedido: reconciledPedido, runtime: reconciledRuntime, transitions };
  }

  while (reconciledPedido.status in AUTO_NEXT_STATUS) {
    const from = reconciledPedido.status as AutomaticOrderStatus;
    const to = AUTO_NEXT_STATUS[from];
    const deadlineMs = enteredAtMs + qa.orderProgressionDelaysMs[to];

    if (deadlineMs > nowMs) {
      break;
    }

    const occurredAt = new Date(deadlineMs).toISOString();
    reconciledPedido.status = to;
    transitions.push({ from, to, occurredAt });

    if (to === 'aceito') {
      const remainingDelayMs =
        qa.orderProgressionDelaysMs.em_preparo +
        qa.orderProgressionDelaysMs.saindo_hub +
        qa.orderProgressionDelaysMs.no_hub;
      reconciledPedido.aceito_em = occurredAt;
      reconciledPedido.tempo_estimado_min = Math.max(1, Math.ceil(remainingDelayMs / 60_000));
    } else if (to === 'saindo_hub') {
      reconciledPedido.saiu_hub_em = occurredAt;
    } else if (to === 'no_hub') {
      reconciledPedido.lojista_chegou_em = occurredAt;
    }

    enteredAtMs = deadlineMs;
    reconciledRuntime = to === 'no_hub' ? null : { enteredStatusAt: occurredAt };
  }

  return { pedido: reconciledPedido, runtime: reconciledRuntime, transitions };
}
