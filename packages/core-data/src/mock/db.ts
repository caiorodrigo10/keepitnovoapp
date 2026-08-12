import type { Cliente } from '../ports/auth.port';
import type { Hub } from '../ports/hub.port';
import type { Estabelecimento, EstabelecimentoHorario } from '../ports/store.port';
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
  /**
   * Story 3.2 (AC4, AC7) — índice mock-only de contas de lojista já
   * cadastradas, usado por `lojista-auth.mock.ts` para simular a rejeição de
   * duplicidade no `signUp` (`EmailJaExisteError`) e, desde a Story 3.10
   * (AC1, AC4), para localizar a conta por e-mail no `signIn` e devolver a
   * metadata do Passo 1 (`getCadastroMetadata`) para o prefill do wizard.
   *
   * [IDS] ADAPT (Story 3.10) do antigo `lojistaEmailsCadastrados: string[]`
   * (só e-mail) — um array de strings não suportava localizar a conta por
   * e-mail no `signIn` nem devolver `nome_fantasia`/`cnpj`/`telefone`/
   * `responsavel_nome` para o prefill (AC4). Nunca semeado por fixture (o
   * piloto sempre começa vazio — nenhum lojista tem conta real por padrão);
   * populado organicamente pelos `signUp`s da sessão mock atual.
   */
  lojistaContas: {
    id: string;
    email: string;
    criado_em: string;
    nome_fantasia: string;
    cnpj: string;
    telefone: string;
    responsavel_nome: string;
  }[];
  /**
   * Story 3.5 — [AUTO-DECISION] equivalente mock de `auth.uid()` para o
   * lojista. Nenhuma story de login do lojista existe ainda (Story 3.10,
   * fora de escopo) — sem isso, o mock de `criarCadastro` não teria como
   * distinguir "o MESMO lojista reenviando o Passo 3" (idempotência, AC3) de
   * "OUTRO lojista com o mesmo CNPJ" (`CnpjDuplicadoError`, AC4).
   * `lojista-auth.mock.ts#signUp` grava aqui o `id` da conta recém-criada —
   * mesmo papel que uma sessão JWT real cumpre no Supabase ao longo do
   * wizard. `null` = nenhum `signUp` ocorreu nesta instância de `MockDb`
   * (equivalente mock de `AUTENTICACAO_NECESSARIA`).
   */
  sessionLojistaUserId: string | null;
  /**
   * Story 3.5 (AC3, AC4) — índice mock-only dos cadastros de estabelecimento
   * já criados (paridade com a RPC `criar_estabelecimento_completo`, sem
   * tocar `db.estabelecimentos` — esse array é o domínio de DESCOBERTA do
   * Cliente, `StorePort.Estabelecimento`, que não modela `cnpj`/
   * `dono_user_id`/`chave_pix`; ver JSDoc de `EstabelecimentoCadastroPort`).
   * Nunca semeado por fixture (mesmo espírito de `lojistaEmailsCadastrados`
   * — piloto sempre começa vazio).
   */
  estabelecimentosCadastrados: {
    id: string;
    donoUserId: string;
    cnpj: string;
    status: 'em_analise' | 'ativo' | 'rejeitado' | 'suspenso';
    /**
     * Story 3.10 (AC3, AC6) — [IDS] ADAPT: campo novo, não existia até esta
     * Story (nenhuma story anterior precisava LER o motivo, só a 3.9
     * persistia — e a 3.9 grava em `db.estabelecimentos`, o array paralelo
     * de Descoberta, não neste índice mock-only do wizard). `null` até que
     * algo grave um motivo real; este índice não tem hoje nenhum mecanismo
     * mock de "admin rejeita" plugado nele (gap conhecido — `admin.mock.ts
     * #reject` opera sobre `db.estabelecimentos`, não sobre este array; ver
     * Dev Notes da Story 3.10 para o racional completo). Testes de
     * `estabelecimento-cadastro.mock.test.ts`/`Login`/roteamento semeiam
     * este campo diretamente para exercitar o ramo `rejeitado`.
     */
    motivoRejeicao: string | null;
    /**
     * Story 3.11 (AC1, AC3) — [IDS] ADAPT: campos do perfil público
     * reaproveitados pela leitura/escrita mock de `getMeuPerfil`/
     * `atualizarMeuPerfil`, em vez de um segundo índice mock paralelo.
     * Gravados por `criarCadastro` a partir do input real do wizard (Story
     * 3.5, que já recebe `nome_fantasia`/`categoria`/`descricao`/
     * `foto_fachada_url`/`horarios`) e atualizáveis só em `categoria`/
     * `descricao` por `atualizarMeuPerfil` (mesma restrição de AC2 —
     * `nomeFantasia` nunca muda por essa rota).
     */
    nomeFantasia: string;
    categoria: string;
    descricao: string | null;
    fotoFachadaUrl: string | null;
    horarios: EstabelecimentoHorario[];
  }[];
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
    lojistaContas: [],
    sessionLojistaUserId: null,
    estabelecimentosCadastrados: [],
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
