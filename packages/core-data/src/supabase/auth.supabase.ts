import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { AuthPort, Cliente, ClienteConfirmacaoTelefone, SignUpInput } from '../ports/auth.port';
import type { AsyncCallOptions } from '../types';
import { EmailJaExisteError } from './auth-errors';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'auth';
const EPIC = 'Épico 2';

/**
 * Esqueleto Supabase de `AuthPort` (Story 1.9). `signUp` implementado na
 * Story 2.3 (Task 6) — os demais métodos (login por e-mail/senha,
 * `currentUser`, `signOut`, `getById`, `updateCpf`) continuam sem chamada
 * de rede, escopo das Stories 2.6+.
 *
 * `client` é opcional — se omitido, instancia um `createClient()` novo
 * (anon key, respeita RLS) por chamada de `createAuthSupabase`, nunca um
 * singleton global do módulo.
 */
export function createAuthSupabase(client?: SupabaseClient<Database>): AuthPort {
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

    async signIn(_email: string, _senha: string, _options?: AsyncCallOptions): Promise<Cliente> {
      throw new NotImplementedError(PORT, 'signIn', EPIC);
    },

    async currentUser(_options?: AsyncCallOptions): Promise<Cliente | null> {
      throw new NotImplementedError(PORT, 'currentUser', EPIC);
    },

    async signOut(_options?: AsyncCallOptions): Promise<void> {
      throw new NotImplementedError(PORT, 'signOut', EPIC);
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
    onAuthStateChange(callback: (cliente: Cliente | null) => void): () => void {
      const { data } = resolveClient().auth.onAuthStateChange((_event, session) => {
        callback(session?.user ? mapUserToCliente(session.user) : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
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
