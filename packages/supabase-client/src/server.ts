import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

function requireServerEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[@keepit/supabase-client/server] Variável obrigatória ausente ou vazia: ${name}.`);
  }
  return value;
}

/**
 * Factory exclusivamente server-side. Não exportar por `./index`: os apps
 * móveis precisam ter um grafo sem identificadores de credencial privilegiada.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  const url = requireServerEnv('SUPABASE_URL');
  const serviceRoleKey = requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
