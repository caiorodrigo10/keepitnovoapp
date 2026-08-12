import { getDataClient } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * [IDS] ADAPT (Story 2.8, AC1, AC2) — mesmo padrão de `useCurrentCliente.ts`
 * (Story 0.4): compõe `useAsyncResource` com `getDataClient().auth`, agora
 * para `currentEmail()`. Hook separado (não incorporado a `useCurrentCliente`)
 * porque `Cliente` não tem `email` (vive na sessão/Auth, nunca em
 * `clientes` — ver `packages/core-data/src/ports/auth.port.ts`); manter as
 * duas fontes de dado em hooks distintos evita reintroduzir a duplicação
 * que a decisão 10.4/2.3 removeu.
 */
export function useCurrentEmail(): AsyncResourceState<string | null> {
  const client = getDataClient();

  return useAsyncResource<string | null>(() => client.auth.currentEmail(), null, []);
}
