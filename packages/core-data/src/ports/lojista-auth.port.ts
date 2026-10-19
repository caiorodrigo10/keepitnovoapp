import type { AsyncCallOptions } from '../types';

/**
 * Story 3.2 (AC4, AC7) — [IDS] CREATE, [AUTO-DECISION].
 *
 * [AUTO-DECISION] Port dedicada (`LojistaAuthPort`), não generalização de
 * `AuthPort` → (reason: a Story 3.2 (Dependencies, item 2) deixa a decisão
 * explicitamente para o @architect, sem prescrever a forma; nesta execução
 * delegada não houve sessão de @architect separada. Optei por uma port nova
 * e mínima em vez de sobrecarregar `AuthPort` (tipado em `Cliente`) porque:
 * (1) `AuthPort.signUp` devolve `Cliente` — reaproveitá-lo produziria um
 * `Cliente` fantasma, exatamente o problema que a Story pede para evitar
 * (AC7); (2) o domínio do lojista autenticado nesta fatia é só a identidade
 * `auth.users`, sem contrapartida em `clientes` nem em `estabelecimentos`
 * (Recorte de escopo do piloto, opção B) — um tipo de retorno próprio
 * (`LojistaConta`) é mais honesto que forçar o shape de `Cliente`; (3) os
 * demais métodos de `AuthPort` (login, perfil, troca de senha) são todos
 * escopo de Stories futuras do lojista (3.10+) — replicá-los aqui como stubs
 * seria antecipar contrato não decidido. Revisão do @architect (Sol) fica
 * registrada como débito para o @qa desta story.
 */
export interface LojistaConta {
  id: string;
  email: string;
  criado_em: string;
}

/**
 * Story 3.2 (AC1, AC4). Campos coletados no Passo 1 do cadastro do lojista
 * que acompanham a criação da conta como `raw_user_meta_data` — nunca
 * persistidos em `estabelecimentos` por este método (essa tabela só é
 * escrita pela Story 3.5, AC3, fora deste lote). `email`/`senha` são as
 * credenciais de fato; os demais campos são metadata para a Story 3.4/3.5
 * reconciliarem quando o cadastro for retomado.
 */
export interface LojistaSignUpInput {
  nome_fantasia: string;
  cnpj: string;
  telefone: string;
  responsavel_nome: string;
  email: string;
  senha: string;
}

/**
 * Story 3.10 (AC1, AC4) — [IDS] ADAPT de `LojistaAuthPort` (extensão, não
 * port nova — ver JSDoc de `LojistaAuthPort` abaixo para o racional
 * completo do `[AUTO-DECISION]`).
 *
 * Metadata do Passo 1 do cadastro (`nome_fantasia`/`cnpj`/`telefone`/
 * `responsavel_nome`), gravada como `raw_user_meta_data` no `signUp`
 * (`lojista-auth.supabase.ts`) — lida de volta aqui SÓ para o prefill
 * best-effort do wizard quando o lojista tem conta mas nenhum
 * `estabelecimentos` ainda (AC4). Todos os campos são `string` (nunca
 * `undefined`/`null`) — metadata ausente ou parcial resolve como `''` por
 * campo, nunca bloqueia a retomada nem lança por isso (AC4, ajuste @po
 * 2026-08-12: "campos faltantes ficam vazios para o lojista preencher, sem
 * inventar valor").
 */
export interface LojistaCadastroMetadata {
  nome_fantasia: string;
  cnpj: string;
  telefone: string;
  responsavel_nome: string;
}

/**
 * Port de autenticação do Lojista — Story 3.2 (`signUp`), estendida pela
 * Story 3.10 (`signIn`/`signOut`/`getCadastroMetadata`).
 *
 * [AUTO-DECISION] (Story 3.10) Extensão de `LojistaAuthPort` — não uma port
 * nova, não reaproveito de `AuthPort` (Cliente) → (reason: a Story 3.2 já
 * reservava esta decisão aqui mesmo ("Login real do Lojista... decide
 * separadamente se estende esta port ou reaproveita algo dela"); sem sessão
 * dedicada de @architect nesta execução, sigo o mesmo padrão de delegação já
 * registrado em `AdminAuthPort`/`apps/admin/src/lib/adminAuth.ts` (Story
 * 3.7) e em `EstabelecimentoCadastroPort` (Story 3.5): (1) `AuthPort` é
 * tipado em `Cliente` — `signIn` devolvendo `Cliente` produziria exatamente
 * o "Cliente fantasma" que a Story 3.2 (AC7) já rejeitou para `signUp`; (2)
 * uma port nova só para login duplicaria o `resolveClient()`
 * lazy/memoizado que `lojista-auth.supabase.ts` já tem, sem ganho real —
 * `signIn`/`signOut`/`getCadastroMetadata` operam sobre a MESMA identidade
 * de `auth.users` que `signUp` já criou, então pertencem à mesma port por
 * coesão de domínio. Revisão de @architect (Sol) registrada como débito
 * para o @qa desta story, mesmo padrão já usado nas Stories 3.3/3.5/3.7.
 *
 * [AUTO-DECISION] (Story 3.10) "Um jeito de a sessão real (Supabase Auth)
 * substituir a sessão mock puramente local de `lojistaSession.ts`" (item (b)
 * da Dependencies) → a sessão real (`lojistaAuth.signIn` + a leitura do
 * próprio `estabelecimentos` via `EstabelecimentoCadastroPort
 * .getMeuEstabelecimento`) passa a ser a ÚNICA fonte que decide QUANDO
 * `lojistaSession.ts#signInLojista()` é chamado (só quando o status real lido
 * é `'ativo'`) — antes desta Story, `Login.tsx` chamava `signInLojista()`
 * incondicionalmente em qualquer toque no botão. `lojistaSession.ts`
 * continua existindo como o "flag de visibilidade Main" consumido por
 * `RootNavigator` (nenhuma tela de `MainTabs` lê a identidade real do
 * lojista logado ainda — reconciliar isso é fora do escopo desta Story,
 * carry-forward para o Épico 6+), mas deixa de ser um mecanismo paralelo
 * independente: passa a ser sempre uma CONSEQUÊNCIA da sessão real. Ver
 * JSDoc de `Login.tsx`/`lojistaSession.ts` para o fluxo completo.
 */
export interface LojistaAuthPort {
  /**
   * Cria a conta Supabase Auth do lojista (e-mail + senha) com
   * `raw_user_meta_data.role = 'lojista'` — o discriminador que o trigger
   * `criar_cliente_apos_signup` (migration `20260812032149`) usa para NÃO
   * criar uma linha em `clientes` (AC7). Falha de e-mail duplicado rejeita
   * com `EmailJaExisteError` (mesma classe/mensagem genérica anti-enumeração
   * já usada pelo domínio Cliente — Story 2.6) via
   * `../supabase/auth-errors`; qualquer outro erro do SDK é propagado tal
   * como recebido, sem sucesso fictício.
   */
  signUp(input: LojistaSignUpInput, options?: AsyncCallOptions): Promise<LojistaConta>;
  /**
   * Story 3.10 (AC1, AC6). Autentica contra o Supabase Auth
   * (`signInWithPassword`, decisão 10.4 — mesma estrutura de
   * `AuthPort.signIn`/`adminAuth.ts#signIn`). Credencial inválida rejeita a
   * Promise tal como o SDK devolveu — a tela (`Login.tsx`) mapeia para uma
   * mensagem genérica; nenhuma sessão fica estabelecida nesse caso (AC1).
   */
  signIn(email: string, senha: string, options?: AsyncCallOptions): Promise<LojistaConta>;
  /** Story 3.10 (item (c) das Dependencies) — encerra a sessão real (Supabase Auth). */
  signOut(options?: AsyncCallOptions): Promise<void>;
  /**
   * Story 3.10 (AC4). Lê `raw_user_meta_data` da sessão autenticada ATUAL —
   * `null` só quando não há nenhuma sessão (nunca deveria acontecer no
   * caminho ativo desta Story, que só chama isto pós-`signIn` bem-sucedido).
   * Best-effort por campo (ver `LojistaCadastroMetadata`) — nunca lança por
   * metadata ausente/parcial.
   */
  getCadastroMetadata(options?: AsyncCallOptions): Promise<LojistaCadastroMetadata | null>;
}
