import { getDataClient, type Cliente } from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

/**
 * [IDS] CREATE (Story 0.4) — não existe hook `useAuth`/`useCurrentCliente` em
 * `@keepit/core-data/hooks` (Story 0.2 só exporta useHubs/useOrders/
 * useStores/useWallet). Como `apps/cliente` não pode modificar
 * `packages/core-data` nesta story (fora do escopo — outro @dev trabalha em
 * paralelo em `apps/lojista`/`apps/admin`), este hook local em
 * `apps/cliente/src/hooks` compõe `useAsyncResource` (exportado por
 * `@keepit/core-data/hooks`) com `getDataClient().auth`, reutilizando 100%
 * da infra assíncrona já validada pela Story 0.2 em vez de duplicá-la.
 *
 * **Story 2.6 (AC6, fecha REL-008 do gate 2.3.1):** removido o fallback
 * `auth.signIn(DEMO_EMAIL, DEMO_SENHA)` quando `currentUser()` não
 * encontrava sessão. Esse fallback existia para o Épico 0 (Home/Perfil
 * abertos direto pelo stub `authGuard.ts`, sem login real acionado no
 * boot). Com `RootNavigator` (Story 2.3.1) só montando `Main` — e portanto
 * qualquer tela que use este hook — quando `onAuthStateChange` já entregou
 * um `Cliente` não-nulo, este hook nunca deveria mais precisar criar uma
 * sessão sozinho; fazer isso era um efeito colateral sobre a navegação
 * raiz (login "fantasma" fora do fluxo de auth) e, com login real
 * (Supabase), tentar `signIn` com uma senha fixa hard-coded contra o
 * backend real falharia de qualquer forma.
 */
export function useCurrentCliente(): AsyncResourceState<Cliente | null> {
  const client = getDataClient();

  return useAsyncResource<Cliente | null>(() => client.auth.currentUser(), null, []);
}
