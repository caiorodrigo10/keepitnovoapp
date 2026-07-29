// Keepit Supabase client wrapper — implemented in Story 1.4
//
// Duas factories:
//   - createClient()            -> cliente com a `anon key`, seguro para uso nos 3 apps
//     (cliente, lojista, admin) e em qualquer código client-side. Respeita RLS.
//   - createServiceRoleClient() -> cliente com a `service_role key`, que IGNORA RLS.
//     NUNCA importar em `apps/cliente`, `apps/lojista` ou `apps/admin`.
//     Uso exclusivo em scripts server-side e Edge Functions.

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

function readEnv(name: string): string | undefined {
  const value = process.env[name];
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
 * Cliente Supabase tipado com a `anon key`.
 *
 * Seguro para uso em qualquer app (`apps/cliente`, `apps/lojista`, `apps/admin`)
 * e em qualquer código client-side — respeita as políticas de RLS do banco.
 *
 * Lança erro claro em runtime (não em import-time) se `SUPABASE_URL` ou
 * `SUPABASE_ANON_KEY` estiverem ausentes/vazias em `process.env`.
 */
export function createClient(): SupabaseClient<Database> {
  const url = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');

  return createSupabaseClient<Database>(url, anonKey);
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
