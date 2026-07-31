import type { Cliente } from '../ports/auth.port';
import type { Hub } from '../ports/hub.port';
import type { Estabelecimento } from '../ports/store.port';
import type { Produto } from '../ports/product.port';
import type { Pedido } from '../ports/order.port';
import type { Saque } from '../ports/wallet.port';
import type { EstabelecimentoFalha, ReembolsoPendente } from '../ports/admin.port';
import {
  clientesCredenciaisFixture,
  clientesFixture,
  estabelecimentosFalhasFixture,
  estabelecimentosFixture,
  hubsFixture,
  pedidosFixture,
  produtosFixture,
  reembolsosFixture,
} from './fixtures';

/**
 * "Banco" in-memory compartilhado por todas as implementações mock.
 *
 * Decisão do @dev (Story 0.2): as fixtures são clonadas (`structuredClone`)
 * na criação de cada `MockDb` para que CRUD feito por uma implementação
 * mock (ex.: `product.mock.ts#create`) seja visível às demais (ex.:
 * `store.mock.ts#getCatalog`) dentro da mesma sessão de processo, SEM
 * mutar as fixtures originais (import re-usável entre testes).
 */
export interface MockDb {
  clientes: Cliente[];
  hubs: Hub[];
  estabelecimentos: Estabelecimento[];
  produtos: Produto[];
  pedidos: Pedido[];
  saques: Saque[];
  reembolsos: ReembolsoPendente[];
  /** `estabelecimentos_falhas` — Story 1.10 (Task 4), promovido de `apps/admin/src/mock/adminOpsTypes.ts`. */
  falhas: EstabelecimentoFalha[];
  /** Sessão de auth mock atual (id do cliente logado, ou `null`). */
  sessionClienteId: string | null;
  /**
   * Story 2.3 (Task 5) — índice mock-only e-mail → cliente, usado só por
   * `auth.mock.ts#signIn`/`signUp`. Não faz parte de nenhuma port
   * (`Cliente` não tem `email`) — ver `clientesCredenciaisFixture`.
   */
  clienteCredenciais: { clienteId: string; email: string }[];
}

export function createMockDb(): MockDb {
  return {
    clientes: structuredClone(clientesFixture),
    hubs: structuredClone(hubsFixture),
    estabelecimentos: structuredClone(estabelecimentosFixture),
    produtos: structuredClone(produtosFixture),
    pedidos: structuredClone(pedidosFixture),
    saques: [],
    // Seedado (não vazio) — Story 1.10 (Task 4): preserva a experiência já
    // existente da tela "Fila de reembolsos" do Admin (Story 0.13), que
    // partia de fixtures locais nunca vazias. Novas entradas continuam
    // sendo inseridas organicamente pelas transições de cancelamento
    // (ver `mock/refund-helpers.ts`).
    reembolsos: structuredClone(reembolsosFixture),
    falhas: structuredClone(estabelecimentosFalhasFixture),
    sessionClienteId: null,
    clienteCredenciais: structuredClone(clientesCredenciaisFixture),
  };
}

/**
 * Instância única do "banco" mock para o processo atual — todas as
 * implementações `*.mock.ts` compartilham esta instância via `getDataClient()`
 * (ver `src/index.ts`). `createDataClient()` chamado diretamente (sem
 * passar pelo singleton) cria uma instância isolada — útil para testes.
 */
export function createSharedMockDb(): MockDb {
  return createMockDb();
}
