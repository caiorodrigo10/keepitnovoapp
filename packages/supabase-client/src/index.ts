// Keepit Supabase client wrapper — implemented in Story 1.4
//
// Duas factories:
//   - createClient()            -> cliente com a `anon key`, seguro para uso nos 3 apps
//     (cliente, lojista, admin) e em qualquer código client-side. Respeita RLS.
//   - createServiceRoleClient() -> cliente com a `service_role key`, que IGNORA RLS.
//     NUNCA importar em `apps/cliente`, `apps/lojista` ou `apps/admin`.
//     Uso exclusivo em scripts server-side e Edge Functions.

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type SupportedStorage,
} from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

/**
 * Lê `EXPO_PUBLIC_{name}` primeiro (o único prefixo que o Expo inlineia no
 * bundle nativo/web dos apps `cliente`/`lojista`), com fallback para `{name}`
 * sem prefixo (Next.js/admin, scripts server-side, testes, Edge Functions —
 * nenhum desses lê `EXPO_PUBLIC_*`). Story 2.5.1 (AC1); decisão registrada em
 * `docs/architecture/06-session-persistence.md` §3.4.
 */
function readEnv(name: string): string | undefined {
  const value = process.env[`EXPO_PUBLIC_${name}`] ?? process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(
      `[@keepit/supabase-client] Variável de ambiente obrigatória ausente ou vazia: ${name}. ` +
        'Confirme que o .env na raiz do monorepo está preenchido (ver .env.example).',
    );
  }
  return value;
}

/**
 * Opções aditivas e opcionais de `createClient()` (Story 2.5.1, AC2).
 *
 * Nenhum campo é obrigatório e nenhum tem efeito se omitido — o
 * comportamento sem `options` continua sendo exatamente o de antes desta
 * story (default do `supabase-js`: `localStorage` no browser, storage em
 * memória em React Native, `persistSession`/`autoRefreshToken` em `true`).
 *
 * `storage` usa `SupportedStorage`, um tipo do próprio `@supabase/supabase-js`
 * — agnóstico de plataforma, sem custo de runtime. Este pacote NUNCA importa
 * `@react-native-async-storage/async-storage`, `expo-secure-store` nem
 * qualquer outro módulo React Native: quem decide e injeta o storage é o
 * bootstrap de cada app (ver `docs/architecture/06-session-persistence.md`
 * §3.1/§3.3). É essa regra que preserva `apps/admin` (Next.js) livre de
 * dependência React Native no grafo de build.
 */
export interface CreateClientOptions {
  /** Adapter de storage. Omitido: default do `supabase-js`. */
  storage?: SupportedStorage;
  /** Default: `true` (default do `supabase-js`). */
  persistSession?: boolean;
  /** Default: `true` (default do `supabase-js`). */
  autoRefreshToken?: boolean;
}

/**
 * Cliente Supabase tipado com a `anon key`.
 *
 * Seguro para uso em qualquer app (`apps/cliente`, `apps/lojista`, `apps/admin`)
 * e em qualquer código client-side — respeita as políticas de RLS do banco.
 *
 * Lança erro claro em runtime (não em import-time) se `SUPABASE_URL` ou
 * `SUPABASE_ANON_KEY` estiverem ausentes/vazias em `process.env`.
 *
 * `options` é aditivo e opcional (Story 2.5.1, AC2) — sem argumento, nenhuma
 * chave de `auth` é passada ao `supabase-js`, preservando o comportamento
 * anterior a esta story em todos os chamadores existentes.
 */
export function createClient(options: CreateClientOptions = {}): SupabaseClient<Database> {
  const url = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');

  const { storage, persistSession, autoRefreshToken } = options;
  const hasAuthOptions = storage !== undefined || persistSession !== undefined || autoRefreshToken !== undefined;

  if (!hasAuthOptions) {
    return createSupabaseClient<Database>(url, anonKey);
  }

  return createSupabaseClient<Database>(url, anonKey, {
    auth: {
      ...(storage !== undefined ? { storage } : {}),
      ...(persistSession !== undefined ? { persistSession } : {}),
      ...(autoRefreshToken !== undefined ? { autoRefreshToken } : {}),
    },
  });
}

/**
 * Cliente Supabase tipado com a `service_role key`.
 *
 * ⚠️ NUNCA importar este factory (nem o módulo que a chama) em código que roda
 * em `apps/cliente`, `apps/lojista` ou `apps/admin` (mobile/admin web). A
 * `service_role key` ignora RLS por completo — uso exclusivo em scripts
 * server-side e Edge Functions.
 *
 * Lança erro claro em runtime (não em import-time) se `SUPABASE_URL` ou
 * `SUPABASE_SERVICE_ROLE_KEY` estiverem ausentes/vazias em `process.env` —
 * isso é esperado hoje, já que `SUPABASE_SERVICE_ROLE_KEY` ainda não foi
 * preenchida no `.env` local (ver Dev Agent Record da Story 1.4).
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  const url = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
