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
 * Story 2.7 (decisão de arquitetura 0.1.3): marca local, sem token/URL/senha,
 * usada exclusivamente para impedir que uma sessão Supabase de RECUPERAÇÃO
 * (criada por `establishPasswordRecoverySession`) seja tratada como login
 * normal por `onAuthStateChange` — sem isso, `RootNavigator` promoveria o
 * usuário para `Main` antes de ele definir a nova senha. Cada implementação
 * de `AuthPort` decide como persistir esse booleano (Supabase: usa o storage
 * já injetado no bootstrap do app; mock: não precisa, mantém em memória).
 */
export interface PasswordRecoveryState {
  isActive(): Promise<boolean>;
  activate(): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Story 2.8 (AC3, AC4): entrada de `AuthPort.updateProfile`. Campos ausentes
 * (`undefined`) não são tocados — só os campos explicitamente passados são
 * persistidos. `telefone: null` limpa o telefone (ele é opcional, decisão
 * 10.4); `telefone: undefined` deixa o valor atual intacto. `nome` vazio (ou
 * só espaços) é rejeitado pelos adapters, não só pela UI — defesa contra
 * qualquer chamador que pule a validação de formulário.
 */
export interface UpdateProfileInput {
  nome?: string;
  telefone?: string | null;
}

/**
 * Story 2.8 (AC5): resultado de `AuthPort.updateEmail`, honesto quanto ao
 * double opt-in do Supabase Auth — `confirmation_required` quando o
 * provedor ainda não efetivou a troca (aguardando confirmação por e-mail),
 * `updated` quando não há confirmação pendente. A tela usa este status para
 * informar o cliente, nunca assume sucesso imediato.
 */
export type UpdateEmailResult = { status: 'confirmation_required' } | { status: 'updated' };

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
  /**
   * Story 2.7 (AC1, AC7): solicita a redefinição de senha ao provedor de
   * autenticação. Resolve sempre da mesma forma para e-mail cadastrado ou
   * não (anti-enumeração — reflete o retorno indistinto do Supabase Auth);
   * a tela nunca sabe se o e-mail existe. Não é sucesso fictício: a chamada
   * de rede é real no adapter Supabase.
   */
  requestPasswordReset(email: string, options?: AsyncCallOptions): Promise<void>;
  /**
   * Story 2.7 (AC3, AC5): consome o deep link de recuperação — a URL bruta
   * (que pode conter tokens) nunca sai desta chamada nem chega à navegação
   * ou à UI. Implementações DEVEM rejeitar callback ausente, de outra rota,
   * com erro ou sem sessão de recuperação válida.
   */
  establishPasswordRecoverySession(callbackUrl: string, options?: AsyncCallOptions): Promise<void>;
  /**
   * Story 2.7 (AC3, AC4, AC5): grava a nova senha na sessão de recuperação
   * ativa (rejeita se não houver uma) e a encerra — a senha não promove
   * automaticamente o usuário a uma sessão logada; ele retorna ao Login.
   */
  updatePassword(password: string, options?: AsyncCallOptions): Promise<void>;
  /**
   * Retorna o cliente autenticado na sessão atual, ou `null` se não houver
   * sessão. Story 2.8 (AC1, AC2): a implementação Supabase lê a própria
   * linha em `clientes` (RLS `cliente_le_proprio`, sem `service_role`) — não
   * reaproveita `user_metadata` (que pode ficar desatualizado após um
   * `updateProfile`).
   */
  currentUser(options?: AsyncCallOptions): Promise<Cliente | null>;
  signOut(options?: AsyncCallOptions): Promise<void>;
  /**
   * Story 2.8 (AC1, AC2): e-mail da sessão autenticada — nunca duplicado em
   * `clientes` (vive só em `auth.users`/na sessão, ver `Cliente`). Retorna
   * `null` sem sessão.
   */
  currentEmail(options?: AsyncCallOptions): Promise<string | null>;
  /**
   * Story 2.8 (AC3, AC4, AC6): atualiza nome/telefone do próprio cliente
   * autenticado — nunca de outro `clienteId`. O adapter Supabase não confia
   * no `clienteId` recebido para autorização (a sessão atual é a única
   * fonte); RLS (`cliente_atualiza_proprio`) é a segunda barreira. Não é
   * usado para CPF (`updateCpf`, Story 0.6/1.10) nem para campos de
   * bloqueio (fora do escopo desta port).
   */
  updateProfile(clienteId: string, input: UpdateProfileInput, options?: AsyncCallOptions): Promise<Cliente>;
  /**
   * Story 2.8 (AC5): fluxo oficial de troca de e-mail do Supabase Auth
   * (`updateUser({ email })`) — nunca escreve em `clientes` (e-mail não é
   * coluna dessa tabela). Não simula sucesso: o status devolvido reflete o
   * que o SDK realmente informou (ver `UpdateEmailResult`).
   */
  updateEmail(newEmail: string, options?: AsyncCallOptions): Promise<UpdateEmailResult>;
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
