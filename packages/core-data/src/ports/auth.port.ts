import type { AsyncCallOptions } from '../types';

/**
 * Domínio: tabela `clientes` (espelha `auth.users`).
 * [Source: docs/architecture/03-data-models.md#1.1 clientes]
 *
 * **Story 2.3 (decisão do @po):** este tipo espelha o schema físico da
 * migration `20260731143000_criar_clientes.sql` — 5 colunas
 * (`id, nome, telefone, cpf, criado_em`). `telefone_confirmado` foi
 * **removido**: essa coluna não existe (decisão 10.4, telefone não é
 * verificado no MVP). `email` **não** entra aqui — não é coluna de
 * `clientes`, vive em `auth.users`/na sessão (ver `SignUpInput`).
 *
 * `bloqueado`/`motivo_bloqueio` permanecem no tipo como campos **opcionais**
 * — [AUTO-DECISION] mantidos → (reason: a migration desta story NÃO cria
 * essas colunas, mas `packages/core-data/src/mock/admin.mock.ts` e
 * `apps/admin/app/(dashboard)/clientes/page.tsx` (Story 1.10, fora do
 * escopo da 2.3, "Não tocar") já leem/escrevem esses campos como
 * obrigatórios. Removê-los quebraria a compilação de código fora do escopo
 * desta story — a instrução original do @po pedia a remoção total, mas
 * isso colide com "Não modificar arquivos fora do escopo" e com "sem
 * regressão". Tornar opcional preserva os dois: o adapter Supabase (Task 6)
 * não precisa populá-los (fica `undefined`, semântica honesta de "ainda não
 * migrado"), e o mock/admin continua funcionando sem alteração. A coluna
 * física só existe quando o Épico 3/9 migrar `bloqueado`.
 */
export interface Cliente {
  id: string;
  nome: string;
  /** Nullable no schema físico (Story 2.3, decisão 10.4). */
  telefone: string | null;
  /** Nullable — só preenchido após o 1º checkout. */
  cpf: string | null;
  /** Opcional — ver nota acima. Ausente até a migration do Épico 3/9. */
  bloqueado?: boolean;
  /** Opcional — ver nota acima. */
  motivo_bloqueio?: string | null;
  criado_em: string;
}

/**
 * Domínio: tabela `clientes_confirmacao_telefone`.
 * [Source: docs/architecture/03-data-models.md#1.2]
 */
export interface ClienteConfirmacaoTelefone {
  id: string;
  cliente_id: string;
  telefone: string;
  tentativas: number;
  /** Expira 10 min após a criação (`config.timeoutAceiteMin` NÃO se aplica aqui — este é um timeout próprio de SMS). */
  expira_em: string;
  consumido_em: string | null;
}

/**
 * Story 2.3 (decisão 10.4, contrato fixado nas Dev Notes): `email`/`senha`
 * entram aqui (entrada do signup), nunca em `Cliente` (saída de perfil, que
 * não tem coluna `email`). `telefone` é nullable, coerente com a migration.
 */
export interface SignUpInput {
  nome: string;
  email: string;
  senha: string;
  telefone: string | null;
}

/**
 * Port de autenticação/perfil do Cliente.
 *
 * Story 2.3 (decisão 10.4): auth é por e-mail/senha via Supabase Auth, não
 * mais telefone + confirmação SMS (`ConfirmacaoSMS.tsx` é stub inativo,
 * fora do fluxo de navegação — não reativar). O mock (`auth.mock.ts`)
 * também não valida a senha de fato — mantém o comportamento permissivo já
 * existente antes desta story, só troca a chave de busca de `telefone` para
 * `email`.
 */
export interface AuthPort {
  signUp(input: SignUpInput, options?: AsyncCallOptions): Promise<Cliente>;
  /**
   * Story 2.3 (Task 5): assinatura trocada de `signIn(telefone)` para
   * `signIn(email, senha)`, coerente com a decisão 10.4 (auth por
   * e-mail/senha). **Corpo continua não implementado no adapter Supabase**
   * — esta story só ajusta o contrato para a Story 2.6 não precisar mudá-lo
   * de novo.
   */
  signIn(email: string, senha: string, options?: AsyncCallOptions): Promise<Cliente>;
  /** Retorna o cliente autenticado na sessão mock atual, ou `null` se não houver sessão. */
  currentUser(options?: AsyncCallOptions): Promise<Cliente | null>;
  signOut(options?: AsyncCallOptions): Promise<void>;
  /** Simula confirmação de SMS — no mock, qualquer código de 4 dígitos é aceito. */
  confirmPhone(clienteId: string, codigo: string, options?: AsyncCallOptions): Promise<ClienteConfirmacaoTelefone>;
  /**
   * Resolve `Cliente` por id — Story 1.10 (Task 3), promovido de
   * `CLIENTE_NOME_POR_ID`/`nomeClienteDisplay` (hard-coded em
   * `apps/lojista/src/screens/pedidos/lojistaOrders.mock.ts`, Story 0.10).
   * Usado pelo Lojista para exibir nome/telefone do cliente num pedido.
   *
   * O gap 10.4 (modelo de auth do Cliente) foi resolvido pela Story 2.3:
   * e-mail/senha via Supabase Auth. `Cliente` (perfil) continua sem `email`
   * — e-mail vive na sessão de auth, não em `clientes` (ver `Cliente`).
   * [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md, seção 10]
   */
  getById(clienteId: string, options?: AsyncCallOptions): Promise<Cliente | null>;
  /** Coleta de CPF no 1º checkout (Story 0.6) — grava `clientes.cpf`. */
  updateCpf(clienteId: string, cpf: string, options?: AsyncCallOptions): Promise<Cliente>;
  /**
   * Story 2.3.1 (AC1, fecha REL-006 do gate da Story 2.3): observa mudanças
   * de sessão (login, logout, signup com sessão, refresh de token).
   * Implementações DEVEM chamar `callback` pelo menos uma vez, de forma
   * assíncrona, com o estado inicial conhecido — é o que permite ao
   * consumidor (`RootNavigator`) saber quando sair do estado "ainda não se
   * sabe" (`undefined`) para "sem sessão" (`null`) ou "com sessão"
   * (`Cliente`). Retorna uma função de `unsubscribe`.
   */
  onAuthStateChange(callback: (cliente: Cliente | null) => void): () => void;
}
