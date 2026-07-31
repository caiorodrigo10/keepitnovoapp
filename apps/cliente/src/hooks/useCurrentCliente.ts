import { getDataClient, type Cliente } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * Telefone da única fixture do mock de `packages/core-data` (Story 0.2,
 * `clientesFixture`) — usado como fallback para popular Perfil/Configurações
 * com "dado mock" real (Task 6 da Story 0.4), já que o Épico 0 não tem um
 * fluxo de login real acionado no boot do app (`authGuard.ts` sempre deixa
 * passar direto para `MainTabs`, sem que `signIn`/`signUp` seja chamado).
 *
 * [AUTO-DECISION] Perfil sem sessão mock ativa no boot → chamar
 * `auth.signIn` com a fixture única em vez de inventar um cliente novo
 * (reason: reaproveita o único registro já existente no mock — Story 0.2 —
 * sem introduzir dado que não veio da port).
 *
 * [AUTO-DECISION] Story 2.3 (compile-fix fora do File List original da
 * story, forçado pela mudança mandatória de assinatura de `signIn` na Task
 * 5) → troquei `DEMO_TELEFONE` por `DEMO_EMAIL`/`DEMO_SENHA`, casados com
 * `clientesCredenciaisFixture` (`packages/core-data/src/mock/fixtures/clientes.ts`)
 * (reason: `signIn` passou a buscar por e-mail, não telefone — decisão
 * 10.4; sem este ajuste `apps/cliente` não compila. `DEMO_SENHA` é
 * ignorada pelo mock, que não valida senha).
 */
const DEMO_EMAIL = 'ana.souza@example.com';
const DEMO_SENHA = 'demo-mock-senha';

/**
 * [IDS] CREATE — não existe hook `useAuth`/`useCurrentCliente` em
 * `@keepit/core-data/hooks` (Story 0.2 só exporta useHubs/useOrders/
 * useStores/useWallet). Como `apps/cliente` não pode modificar
 * `packages/core-data` nesta story (fora do escopo — outro @dev trabalha em
 * paralelo em `apps/lojista`/`apps/admin`), este hook local em
 * `apps/cliente/src/hooks` compõe `useAsyncResource` (exportado por
 * `@keepit/core-data/hooks`) com `getDataClient().auth`, reutilizando 100%
 * da infra assíncrona já validada pela Story 0.2 em vez de duplicá-la.
 */
export function useCurrentCliente(): AsyncResourceState<Cliente | null> {
  const client = getDataClient();

  return useAsyncResource<Cliente | null>(
    async () => {
      const current = await client.auth.currentUser();
      if (current) {
        return current;
      }
      return client.auth.signIn(DEMO_EMAIL, DEMO_SENHA);
    },
    null,
    [],
  );
}
