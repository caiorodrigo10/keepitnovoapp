import type { DataClient } from '@keepit/core-data';

import { clearCartState } from './cartStorage';
import type { CartMutationResult } from './cartTransaction';

export type ResetDemoScenarioResult =
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'reset' }
  | {
      status: 'degraded';
      failures: Array<'scenario-persistence' | 'cart-persistence' | 'cart-live-state'>;
    };

export interface ResetDemoScenarioOptions {
  /** Limpa o estado do CartProvider sem acoplar este coordenador ao React. */
  clearLiveCart?: () => void | CartMutationResult | Promise<void | CartMutationResult>;
  /** Limpa snapshots compartilhados de pedidos após restaurar o cenário. */
  clearOrders?: () => void;
}

/**
 * Coordena o reset já confirmado pela futura UI do Painel QA. Persistência
 * do cenário/carrinho permanece fail-open, mas degradação volta no resultado.
 * O callback opcional permite à UI futura zerar também o CartProvider vivo.
 */
export async function resetDemoScenario(
  client: DataClient,
  confirmed: boolean,
  options: ResetDemoScenarioOptions = {},
): Promise<ResetDemoScenarioResult> {
  if (!confirmed) {
    return { status: 'cancelled' };
  }
  if (!client.demoScenario) {
    return { status: 'unavailable' };
  }

  const scenario = await client.demoScenario.reset();
  options.clearOrders?.();
  const cart = await clearCartState();

  const failures: Array<'scenario-persistence' | 'cart-persistence' | 'cart-live-state'> = [];
  if (scenario.status === 'degraded') {
    failures.push('scenario-persistence');
  }
  if (cart.status === 'degraded') {
    failures.push('cart-persistence');
  }
  try {
    const liveCartResult = await options.clearLiveCart?.();
    if (liveCartResult?.status === 'persistence_error') {
      failures.push('cart-live-state');
    }
  } catch {
    failures.push('cart-live-state');
  }
  return failures.length > 0 ? { status: 'degraded', failures } : { status: 'reset' };
}
