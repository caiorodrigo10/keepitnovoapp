import type { DataClient } from '@keepit/core-data';

import { clearCartState } from './cartStorage';

export type ResetDemoScenarioResult =
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'reset' };

/**
 * Coordena o reset já confirmado pela futura UI do Painel QA. A limpeza do
 * carrinho é fail-open para que uma falha no storage do app não impeça o
 * reset da fixture persistida no core-data.
 */
export async function resetDemoScenario(
  client: DataClient,
  confirmed: boolean,
): Promise<ResetDemoScenarioResult> {
  if (!confirmed) {
    return { status: 'cancelled' };
  }
  if (!client.demoScenario) {
    return { status: 'unavailable' };
  }

  await client.demoScenario.reset();
  await clearCartState();
  return { status: 'reset' };
}
