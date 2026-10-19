// Keepit Supabase client wrapper — implemented in Story 1.4
//
// Factory pública para cliente com a `anon key`, segura para uso nos 3 apps
// (cliente, lojista, admin) e em qualquer código client-side. Respeita RLS.
// A factory privilegiada vive isolada em `./server`, para que código móvel
// nunca carregue identificadores nem caminhos de credencial server-side.

import {
  createClient as createSupabaseClient,
  type AuthFlowType,
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

function requireEnv(name: string, configuredValue = readEnv(name)): string {
  const value = configuredValue?.trim();
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
  /** Configuração explícita para bundlers web que só inlineiam acessos estáticos a `process.env`. */
  url?: string;
  /** Chave anônima explícita correspondente a `url`. */
  anonKey?: string;
  /** Adapter de storage. Omitido: default do `supabase-js`. */
  storage?: SupportedStorage;
  /** Default: `true` (default do `supabase-js`). */
  persistSession?: boolean;
  /** Default: `true` (default do `supabase-js`). */
  autoRefreshToken?: boolean;
  /** Default do SDK: `implicit`; use `pkce` em apps móveis e server-side. */
  flowType?: AuthFlowType;
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
  const url = requireEnv('SUPABASE_URL', options.url);
  const anonKey = requireEnv('SUPABASE_ANON_KEY', options.anonKey);

  const { storage, persistSession, autoRefreshToken, flowType } = options;
  const hasAuthOptions =
    storage !== undefined ||
    persistSession !== undefined ||
    autoRefreshToken !== undefined ||
    flowType !== undefined;

  if (!hasAuthOptions) {
    return createSupabaseClient<Database>(url, anonKey);
  }

  return createSupabaseClient<Database>(url, anonKey, {
    auth: {
      ...(storage !== undefined ? { storage } : {}),
      ...(persistSession !== undefined ? { persistSession } : {}),
      ...(autoRefreshToken !== undefined ? { autoRefreshToken } : {}),
      ...(flowType !== undefined ? { flowType } : {}),
    },
  });
}
