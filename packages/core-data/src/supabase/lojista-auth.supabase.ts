import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  LojistaAuthPort,
  LojistaCadastroMetadata,
  LojistaConta,
  LojistaSignUpInput,
} from '../ports/lojista-auth.port';
import type { AsyncCallOptions } from '../types';
import { EmailJaExisteError } from './auth-errors';

/**
 * Adapter Supabase de `LojistaAuthPort` — Story 3.2 (AC4, AC7).
 *
 * [IDS] REUSE de padrão: mesma estrutura de `resolveClient()` lazy/memoizado
 * de `auth.supabase.ts` (Story 2.3/2.3.1) — `client` opcional, sem exigir
 * env vars fora de quem realmente chama `signUp`. `EmailJaExisteError`
 * (Story 2.3) é reaproveitada tal como está: a mensagem é genérica o
 * suficiente para o domínio do lojista, e duplicar a classe só para trocar
 * o texto violaria REUSE sem ganho real.
 */
export function createLojistaAuthSupabase(client?: SupabaseClient<Database>): LojistaAuthPort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    /**
     * Story 3.2 (AC4, AC7). Único `raw_user_meta_data` enviado é
     * `role: 'lojista'` + os campos coletados no Passo 1 — NUNCA os campos
     * normativos `nome`/`telefone` do contrato do Cliente (Story 2.3), para
     * não colidir com nenhuma leitura futura desse contrato. O trigger
     * `criar_cliente_apos_signup` (migration `20260812032149`) lê apenas
     * `role`; os demais campos ficam disponíveis em `auth.users.raw_user_meta_data`
     * só para inspeção manual/QA — nenhuma tabela de domínio os lê ainda
     * (`estabelecimentos` é escrito só pela Story 3.5).
     *
     * Mesma obfuscação anti-enumeração documentada em `auth.supabase.ts#signUp`
     * (Story 2.3): `error.code` de duplicidade OU sucesso aparente com
     * `identities: []` — ambos os sinais viram `EmailJaExisteError`.
     *
     * `LojistaConta` retornado é montado localmente a partir de
     * `data.user`, sem `SELECT` adicional (não há tabela de perfil do
     * lojista nesta fatia — ver Dev Notes da Story 3.2, "Recorte de escopo
     * do piloto").
     */
    async signUp(input: LojistaSignUpInput, _options?: AsyncCallOptions): Promise<LojistaConta> {
      const supabase = resolveClient();

      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.senha,
        options: {
          data: {
            role: 'lojista',
            nome_fantasia: input.nome_fantasia.trim(),
            cnpj: input.cnpj,
            telefone: input.telefone,
            responsavel_nome: input.responsavel_nome.trim(),
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

      const conta: LojistaConta = {
        id: data.user.id,
        email: input.email,
        criado_em: data.user.created_at ?? new Date().toISOString(),
      };
      return conta;
    },

    /**
     * Story 3.10 (AC1, AC6). `supabase.auth.signInWithPassword` é a única
     * chamada de rede — mesma honestidade documentada em `auth.supabase.ts
     * #signIn` (Cliente, Story 2.6): sem retry, sem fallback, erro do SDK
     * relançado tal como recebido (a tela mapeia para uma mensagem
     * genérica). `LojistaConta` montado localmente a partir de `data.user`,
     * sem `SELECT` adicional — mesmo motivo documentado em `signUp` acima
     * (não há tabela de perfil do lojista nesta fatia).
     */
    async signIn(email: string, senha: string, _options?: AsyncCallOptions): Promise<LojistaConta> {
      const supabase = resolveClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });

      if (error) {
        throw error;
      }
      if (!data.user) {
        throw new Error('[core-data/supabase] lojistaAuth.signIn — resposta sem usuário e sem erro do SDK.');
      }

      return {
        id: data.user.id,
        email: data.user.email ?? email,
        criado_em: data.user.created_at ?? new Date().toISOString(),
      };
    },

    /** Story 3.10 (Dependencies, item (c)) — única chamada de rede, sem sucesso fictício. */
    async signOut(_options?: AsyncCallOptions): Promise<void> {
      const { error } = await resolveClient().auth.signOut();
      if (error) {
        throw error;
      }
    },

    /**
     * Story 3.10 (AC4). Lê `user_metadata` da sessão atual via `getUser()`
     * (mesma fonte que `signUp` gravou, ver JSDoc de `signUp` acima — chaves
     * `nome_fantasia`/`cnpj`/`telefone`/`responsavel_nome`). `null` só sem
     * sessão nenhuma; campo ausente/de tipo inesperado no metadata resolve
     * como `''`, nunca lança (AC4 — "ausência de metadata nunca bloqueia a
     * retomada").
     */
    async getCadastroMetadata(_options?: AsyncCallOptions): Promise<LojistaCadastroMetadata | null> {
      const supabase = resolveClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        throw error;
      }
      const user = data.user;
      if (!user) {
        return null;
      }
      const metadata = user.user_metadata ?? {};
      const readString = (key: string): string => (typeof metadata[key] === 'string' ? (metadata[key] as string) : '');
      return {
        nome_fantasia: readString('nome_fantasia'),
        cnpj: readString('cnpj'),
        telefone: readString('telefone'),
        responsavel_nome: readString('responsavel_nome'),
      };
    },
  };
}
