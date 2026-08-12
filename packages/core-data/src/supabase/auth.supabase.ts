import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  AuthPort,
  Cliente,
  ClienteConfirmacaoTelefone,
  PasswordRecoveryState,
  SignUpInput,
  UpdateEmailResult,
  UpdateProfileInput,
} from '../ports/auth.port';
import type { AsyncCallOptions } from '../types';
import { EmailJaExisteError } from './auth-errors';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'auth';
const EPIC = 'Épico 2';

/**
 * Story 2.7 — decisão de arquitetura 0.1.3: callback canônico exato
 * (`com.keepithub.cliente://auth/reset`), o único enviado a
 * `resetPasswordForEmail` e o único aceito por `establishPasswordRecoverySession`.
 */
export const PASSWORD_RECOVERY_REDIRECT_TO = 'com.keepithub.cliente://auth/reset';

/**
 * Esqueleto Supabase de `AuthPort` (Story 1.9). `signUp` implementado na
 * Story 2.3 (Task 6); `signIn` implementado na Story 2.6 (login por
 * e-mail/senha) — os demais métodos (`currentUser`, `signOut`, `getById`,
 * `updateCpf`) continuam sem chamada de rede, escopo de stories futuras.
 *
 * `client` é opcional — se omitido, instancia um `createClient()` novo
 * (anon key, respeita RLS) por chamada de `createAuthSupabase`, nunca um
 * singleton global do módulo.
 */
export function createAuthSupabase(
  client?: SupabaseClient<Database>,
  passwordRecoveryState: PasswordRecoveryState = createInMemoryPasswordRecoveryState(),
): AuthPort {
  // Lazy: só instancia um `SupabaseClient` de verdade se algum método
  // precisar. Evita exigir `SUPABASE_URL`/`SUPABASE_ANON_KEY` em ambientes
  // (ex.: CI de typecheck/test) que só verificam o contrato do esqueleto
  // para os métodos ainda não implementados.
  //
  // Story 2.3.1 (Task 3, AC2): memoizada dentro do closure de
  // `createAuthSupabase()` — pré-condição para `onAuthStateChange` refletir
  // as sessões criadas por `signUp`/`signIn` chamados através do mesmo
  // `DataClient`. Antes desta story, `resolveClient` criava um
  // `SupabaseClient` novo a cada chamada de método; cada instância tem seu
  // próprio `GoTrueClient` interno, então duas instâncias distintas não
  // compartilham estado de sessão em memória entre si — `onAuthStateChange`
  // numa instância nunca veria o `signUp` de outra. Só `auth.supabase.ts`
  // muda: os outros 7 adapters (`store`, `product`, `hub`, `order`,
  // `wallet`, `admin`, `analytics`) não precisam de reatividade de sessão e
  // mantêm o padrão anterior (ver Dev Notes da Story 2.3.1).
  //
  // Quando `client` é passado explicitamente (ex. testes), `cachedClient` é
  // o próprio `client` recebido — nunca substituído.
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    /**
     * Story 2.3 (Task 6, AC1/AC3/AC4/AC5). Chaves de `options.data`
     * (`nome`/`telefone`) seguem literalmente o "Contrato normativo de
     * `raw_user_meta_data`" fixado nas Dev Notes da Story 2.3 — a função
     * `criar_cliente_apos_signup()` (trigger, Task 3 do @data-engineer) lê
     * exatamente essas chaves. `Cliente` retornado é construído a partir do
     * que já se sabe (input + `data.user.id`), sem `SELECT` adicional em
     * `clientes`: com `Confirm email` ainda ON no `keepit-dev` (ver Task 4,
     * pendente — Caio aplica manualmente), `signUp` não retorna sessão
     * (`session: null`), e sem sessão a RLS (`cliente_le_proprio`, `USING
     * (id = auth.uid())`) bloquearia um `SELECT` com a anon key mesmo tendo
     * acabado de criar a linha via trigger. Ler de volta exigiria
     * `service_role` (não disponível/apropriado aqui) — por isso o retorno é
     * montado localmente; é honesto porque espelha exatamente o que o
     * trigger grava (mesmo `nome`/`telefone` enviados, `cpf: null`,
     * `bloqueado`/`motivo_bloqueio` ausentes por não fazerem parte da
     * migration desta story).
     */
    async signUp(input: SignUpInput, _options?: AsyncCallOptions): Promise<Cliente> {
      const supabase = resolveClient();
      const nome = input.nome.trim();
      const telefone = input.telefone?.trim() || null;

      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.senha,
        options: {
          data: {
            nome,
            telefone,
          },
        },
      });

      if (error) {
        if (error.code === 'user_already_exists' || error.code === 'email_exists') {
          throw new EmailJaExisteError(input.email);
        }
        throw error;
      }

      // Obfuscação intencional do Supabase Auth (ver `auth-errors.ts`):
      // e-mail já cadastrado + `Confirm email` ON retorna `error: null` mas
      // `identities: []`.
      if (!data.user || data.user.identities?.length === 0) {
        throw new EmailJaExisteError(input.email);
      }

      const cliente: Cliente = {
        id: data.user.id,
        nome,
        telefone,
        cpf: null,
        criado_em: data.user.created_at ?? new Date().toISOString(),
      };
      return cliente;
    },

    /**
     * Story 2.6 (Task, AC3). `supabase.auth.signInWithPassword` é a única
     * chamada de rede — sem retry, sem fallback, sem simular sucesso: em
     * caso de `error` (credencial inválida, rede, etc.), o erro do SDK é
     * relançado tal como recebido para quem chamou (a tela mapeia para uma
     * mensagem genérica, ver `Login.tsx`; este adapter não decide texto de
     * UI). Em sucesso, reaproveita `mapUserToCliente` (mesma função usada
     * por `onAuthStateChange`, Story 2.3.1) para não duplicar a lógica de
     * mapear `user.user_metadata` → `Cliente` — nenhum `SELECT` em
     * `clientes` (mesma decisão/motivo documentado em `signUp` acima).
     */
    async signIn(email: string, senha: string, _options?: AsyncCallOptions): Promise<Cliente> {
      const supabase = resolveClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });

      if (error) {
        throw error;
      }

      if (!data.user) {
        // Guarda defensiva: o tipo `AuthResponse` do SDK não garante
        // estaticamente `user` não-nulo quando `error` é `null` — nunca
        // observado em teste, mas não é seguro simular sucesso aqui.
        throw new Error('[core-data/supabase] auth.signIn — resposta sem usuário e sem erro do SDK.');
      }

      return mapUserToCliente(data.user);
    },

    /**
     * Story 2.7 (Task, AC1, AC7). Única chamada de rede — `error: null` do
     * SDK não distingue e-mail cadastrado de não cadastrado (mesma
     * obfuscação documentada em `signUp`/`EmailJaExisteError`, aqui a favor
     * do usuário: a tela mostra a mesma confirmação neutra nos dois casos,
     * ver `EsqueciSenha.tsx`). Erro real do SDK (rede, rate limit) é
     * relançado tal como recebido, sem mascarar como sucesso.
     */
    async requestPasswordReset(email: string, _options?: AsyncCallOptions): Promise<void> {
      const { error } = await resolveClient().auth.resetPasswordForEmail(email, {
        redirectTo: PASSWORD_RECOVERY_REDIRECT_TO,
      });
      if (error) {
        throw error;
      }
    },

    /**
     * Story 2.7 (Task, AC3, AC5). Recebe a URL bruta do callback (pode
     * conter `access_token`/`refresh_token` no fragmento, ou `code` na
     * query — PKCE) e a consome inteiramente dentro deste adapter via
     * `parsePasswordRecoveryCallback`; nada da URL sai daqui. Marca
     * `passwordRecoveryState` ANTES de trocar a sessão para que
     * `onAuthStateChange` (que pode disparar de forma síncrona/imediata
     * dentro de `setSession`/`exchangeCodeForSession`) já veja a sessão
     * como "somente recuperação" e não promova o usuário para `Main`. Em
     * qualquer falha, desfaz a marca e relança — sem sessão de recuperação
     * ativa, `updatePassword` também não pode ter efeito.
     */
    async establishPasswordRecoverySession(callbackUrl: string, _options?: AsyncCallOptions): Promise<void> {
      const callback = parsePasswordRecoveryCallback(callbackUrl);
      const auth = resolveClient().auth;

      await passwordRecoveryState.activate();
      try {
        if (callback.code) {
          const { error } = await auth.exchangeCodeForSession(callback.code);
          if (error) {
            throw error;
          }
          return;
        }

        if (!callback.accessToken || !callback.refreshToken) {
          throw new Error('[core-data/supabase] auth.establishPasswordRecoverySession — callback sem sessão válida.');
        }
        const { error } = await auth.setSession({
          access_token: callback.accessToken,
          refresh_token: callback.refreshToken,
        });
        if (error) {
          throw error;
        }
      } catch (error) {
        await passwordRecoveryState.clear();
        throw error;
      }
    },

    /**
     * Story 2.7 (Task, AC3, AC4, AC5). Exige sessão de recuperação ativa —
     * nunca troca senha de uma sessão de login comum por esta via. Após
     * `updateUser`, encerra a sessão (`signOut`) para que o retorno ao
     * Login (AC4) não deixe o usuário logado automaticamente com a sessão
     * de recuperação; só então limpa a marca. Se `signOut` falhar, a marca
     * permanece ativa (mais seguro manter `onAuthStateChange` bloqueando a
     * promoção do que arriscar liberar o `Main` com uma sessão inconsistente).
     */
    async updatePassword(password: string, _options?: AsyncCallOptions): Promise<void> {
      if (!(await passwordRecoveryState.isActive())) {
        throw new Error('[core-data/supabase] auth.updatePassword — nenhuma sessão de recuperação ativa.');
      }
      const auth = resolveClient().auth;
      const { error } = await auth.updateUser({ password });
      if (error) {
        throw error;
      }

      const { error: signOutError } = await auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
      await passwordRecoveryState.clear();
    },

    /**
     * Story 2.8 (AC1, AC2). Lê a sessão via `getUser()` (valida o JWT junto
     * ao provedor, não só localmente) e depois a própria linha em
     * `clientes` (RLS `cliente_le_proprio`, anon key, sem `service_role`) —
     * ao contrário de `signIn`/`onAuthStateChange`, que montam `Cliente` a
     * partir de `user_metadata` (decisão histórica documentada acima), este
     * método é a fonte de verdade de perfil desta story: `user_metadata`
     * pode ficar desatualizado após um `updateProfile`, a linha de
     * `clientes` nunca fica. Sem sessão, resolve `null` (nunca lança) —
     * mesmo contrato do mock. Se a sessão existir mas a linha em `clientes`
     * não (não deveria acontecer, o trigger de signup garante 1:1), lança em
     * vez de simular um perfil vazio.
     */
    async currentUser(_options?: AsyncCallOptions): Promise<Cliente | null> {
      const supabase = resolveClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      const user = userData.user;
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome, telefone, cpf, criado_em')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error('[core-data/supabase] auth.currentUser — sessão autenticada sem linha em clientes.');
      }
      return data;
    },

    /** Story 2.8 (AC8) — única chamada de rede, sem sucesso fictício; encerra a sessão persistida (ver Story 2.5.1). */
    async signOut(_options?: AsyncCallOptions): Promise<void> {
      const { error } = await resolveClient().auth.signOut();
      if (error) {
        throw error;
      }
    },

    /** Story 2.8 (AC1, AC2) — e-mail da sessão via `getUser()`; nunca lido de `clientes` (a coluna não existe). */
    async currentEmail(_options?: AsyncCallOptions): Promise<string | null> {
      const { data, error } = await resolveClient().auth.getUser();
      if (error) {
        throw error;
      }
      return data.user?.email ?? null;
    },

    /**
     * Story 2.8 (AC3, AC4, AC6). Foco de segurança (CodeRabbit): o
     * `clienteId` recebido NUNCA é usado para autorizar a query — a sessão
     * atual (`getUser()`) é a única fonte de verdade de "quem sou eu"; se o
     * `clienteId` do chamador não bater com o `user.id` da sessão, rejeita
     * localmente antes de qualquer chamada de rede de escrita (defesa
     * redundante à RLS `cliente_atualiza_proprio`, não uma substituição
     * dela). `nome` vazio é rejeitado aqui também, não só na UI. Após o
     * `UPDATE`, `.select().maybeSingle()` confirma que uma linha foi
     * realmente afetada — RLS que bloqueasse silenciosamente devolveria 0
     * linhas, e isso vira erro explícito, nunca um sucesso fictício.
     */
    async updateProfile(clienteId: string, input: UpdateProfileInput, _options?: AsyncCallOptions): Promise<Cliente> {
      const supabase = resolveClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      const user = userData.user;
      if (!user) {
        throw new Error('[core-data/supabase] auth.updateProfile — sem sessão autenticada.');
      }
      if (user.id !== clienteId) {
        throw new Error('[core-data/supabase] auth.updateProfile — clienteId não corresponde à sessão autenticada.');
      }

      const patch: { nome?: string; telefone?: string | null } = {};
      if (input.nome !== undefined) {
        const nome = input.nome.trim();
        if (!nome) {
          throw new Error('[core-data/supabase] auth.updateProfile — nome não pode ser vazio.');
        }
        patch.nome = nome;
      }
      if (input.telefone !== undefined) {
        patch.telefone = input.telefone?.trim() || null;
      }
      if (Object.keys(patch).length === 0) {
        throw new Error('[core-data/supabase] auth.updateProfile — nenhum campo para atualizar.');
      }

      const { data, error } = await supabase
        .from('clientes')
        .update(patch)
        .eq('id', user.id)
        .select('id, nome, telefone, cpf, criado_em')
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error('[core-data/supabase] auth.updateProfile — RLS bloqueou a escrita ou o perfil não existe.');
      }
      return data;
    },

    /**
     * Story 2.8 (AC5). Único ponto que chama `auth.updateUser({ email })` —
     * o fluxo oficial de troca de e-mail do Supabase Auth (double opt-in).
     * Nunca escreve em `clientes` (a coluna não existe ali, ver `Cliente`).
     * `data.user.new_email` só vem preenchido quando o provedor ainda não
     * efetivou a troca (confirmação pendente) — usado aqui só para compor o
     * status devolvido, nunca logado nem exposto além disso.
     */
    async updateEmail(newEmail: string, _options?: AsyncCallOptions): Promise<UpdateEmailResult> {
      const email = newEmail.trim();
      if (!email) {
        throw new Error('[core-data/supabase] auth.updateEmail — e-mail inválido.');
      }
      const { data, error } = await resolveClient().auth.updateUser({ email });
      if (error) {
        throw error;
      }
      return data.user?.new_email ? { status: 'confirmation_required' } : { status: 'updated' };
    },

    async confirmPhone(
      _clienteId: string,
      _codigo: string,
      _options?: AsyncCallOptions,
    ): Promise<ClienteConfirmacaoTelefone> {
      throw new NotImplementedError(PORT, 'confirmPhone', EPIC);
    },

    async getById(_clienteId: string, _options?: AsyncCallOptions): Promise<Cliente | null> {
      throw new NotImplementedError(PORT, 'getById', EPIC);
    },

    async updateCpf(_clienteId: string, _cpf: string, _options?: AsyncCallOptions): Promise<Cliente> {
      throw new NotImplementedError(PORT, 'updateCpf', EPIC);
    },

    /**
     * Story 2.3.1 (Task 3, AC1). Assina `resolveClient().auth.onAuthStateChange`
     * — a mesma instância memoizada (AC2) usada por `signUp`, para que os
     * eventos de sessão gerados por ele sejam observados aqui. Mapeia
     * `session.user` → `Cliente` via `mapUserToCliente` (sem `SELECT` em
     * `clientes` — mesma decisão/motivo já documentado no `signUp` desta
     * story: RLS exigiria sessão, e ler o perfil completo é escopo de
     * `getById`/2.6+).
     */
    /**
     * Story 2.7 (Task, AC5): antes de mapear `session.user`, confere
     * `passwordRecoveryState` — uma sessão de recuperação ativa nunca
     * dispara `callback` com um `Cliente` não-nulo, mesmo com uma
     * `session` válida no SDK. Isso cobre o caso de reinício do app com a
     * sessão de recuperação persistida (Supabase reidrata via
     * `INITIAL_SESSION`): sem essa checagem, `RootNavigator` promoveria o
     * usuário para `Main` antes de ele redefinir a senha. Não usa `await`
     * diretamente no callback do SDK (evita bloquear o lock interno do
     * `supabase-js`) — a checagem assíncrona roda numa Promise isolada.
     */
    onAuthStateChange(callback: (cliente: Cliente | null) => void): () => void {
      const { data } = resolveClient().auth.onAuthStateChange((_event, session) => {
        void passwordRecoveryState.isActive().then((active) => {
          callback(!active && session?.user ? mapUserToCliente(session.user) : null);
        });
      });
      return () => data.subscription.unsubscribe();
    },
  };
}

/** Story 2.7 — default de `passwordRecoveryState` quando o app não injeta um (ex.: testes, chamador sem bootstrap dedicado). */
function createInMemoryPasswordRecoveryState(): PasswordRecoveryState {
  let active = false;
  return {
    async isActive() {
      return active;
    },
    async activate() {
      active = true;
    },
    async clear() {
      active = false;
    },
  };
}

/**
 * Story 2.7 (AC3, AC5) — único ponto que lê o conteúdo do callback de
 * recuperação. Devolve somente o mínimo necessário para restaurar a sessão
 * (`code` do fluxo PKCE OU `access_token`/`refresh_token` do fluxo
 * implícito); nunca devolve a URL/hash inteiros nem loga nada. Rejeita
 * qualquer URL que não seja exatamente `PASSWORD_RECOVERY_REDIRECT_TO`,
 * que carregue `error` (link expirado/inválido do próprio Supabase) ou que
 * não traga nenhum dos dois formatos de sessão reconhecidos.
 */
function parsePasswordRecoveryCallback(callbackUrl: string): {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
} {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    throw new Error('[core-data/supabase] auth.establishPasswordRecoverySession — callback inválido.');
  }

  if (`${url.protocol}//${url.host}${url.pathname}` !== PASSWORD_RECOVERY_REDIRECT_TO) {
    throw new Error('[core-data/supabase] auth.establishPasswordRecoverySession — callback de outra rota.');
  }

  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  if (url.searchParams.has('error') || hash.has('error')) {
    throw new Error('[core-data/supabase] auth.establishPasswordRecoverySession — link inválido ou expirado.');
  }

  const code = url.searchParams.get('code');
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (!code && (!accessToken || !refreshToken || hash.get('type') !== 'recovery')) {
    throw new Error('[core-data/supabase] auth.establishPasswordRecoverySession — callback sem sessão válida.');
  }

  return { code, accessToken, refreshToken };
}

/**
 * Story 2.3.1 (Task 3): monta um `Cliente` a partir de `session.user`,
 * mesmo padrão de honestidade já usado em `signUp` (Story 2.3, Task 6).
 * `nome`/`telefone` lidos de `user_metadata` (mesmas chaves do "Contrato
 * normativo de `raw_user_meta_data`" da Story 2.3). `cpf: null`,
 * `bloqueado`/`motivo_bloqueio` ausentes (campos opcionais em `Cliente`) —
 * coerente com o resto do arquivo. Não faz `SELECT` em `clientes`.
 */
function mapUserToCliente(user: { id: string; user_metadata?: Record<string, unknown>; created_at?: string }): Cliente {
  return {
    id: user.id,
    nome: typeof user.user_metadata?.nome === 'string' ? user.user_metadata.nome : '',
    telefone: typeof user.user_metadata?.telefone === 'string' ? user.user_metadata.telefone : null,
    cpf: null,
    criado_em: user.created_at ?? new Date().toISOString(),
  };
}
