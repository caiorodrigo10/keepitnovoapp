import type { DataClient } from '@keepit/core-data';

import { clearCartState } from './cartStorage';

export type ResetDemoScenarioResult =
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'reset' }
  | {
      status: 'degraded';
      failures: Array<'scenario-persistence' | 'cart-persistence'>;
    };

export interface ResetDemoScenarioOptions {
  /** Limpa o estado do CartProvider sem acoplar este coordenador ao React. */
  clearLiveCart?: () => void | Promise<void>;
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
  const cart = await clearCartState();
  await options.clearLiveCart?.();

  const failures: Array<'scenario-persistence' | 'cart-persistence'> = [];
  if (scenario.status === 'degraded') {
    failures.push('scenario-persistence');
  }
  if (cart.status === 'degraded') {
    failures.push('cart-persistence');
  }
  return failures.length > 0 ? { status: 'degraded', failures } : { status: 'reset' };
}
