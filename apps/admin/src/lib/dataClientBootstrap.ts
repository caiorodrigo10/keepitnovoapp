import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';
import { getDataClient } from '@keepit/core-data';

/**
 * Bootstrap do `DataClient` do Admin — Story 3.7 (AC1-AC4, AC6).
 *
 * [IDS] ADAPT de `apps/cliente/src/lib/dataClientBootstrap.ts` (Story 2.5.1)
 * e `apps/lojista/src/lib/dataClientBootstrap.ts` (Story 3.2): mesmo padrão
 * — gate por env var, injeta UM `SupabaseClient` compartilhado em
 * `getDataClient({ source, supabaseClient })` (fecha "N SupabaseClient
 * distintos por DataClient", `docs/architecture/06-session-persistence.md`
 * §1.4(b)), fallback silencioso para mock sem tela branca. Adaptado para
 * Next.js/browser em vez de Expo/React Native:
 * (1) lê `DATA_SOURCE` SEM prefixo — Next.js/admin não lê `EXPO_PUBLIC_*`
 *     (ver `.env.example`); precisa do campo `env` em `next.config.mjs`
 *     para chegar ao bundle (Next só inlineia `NEXT_PUBLIC_*` por padrão).
 * (2) NÃO passa `storage` customizado — o Admin roda só no browser (sem app
 *     nativo), então o default do `supabase-js` (`window.localStorage`) já
 *     é o storage correto; `AsyncStorage` é exclusivo de Expo/React Native.
 *
 * **Efeito colateral no import** — precisa ser avaliado antes de qualquer
 * chamada a `getDataClient()` sem argumentos (mesmo motivo documentado nos
 * dois bootstraps irmãos: `getDataClient()` memoiza a configuração da
 * primeira chamada). `adminAuth.ts` importa `getAdminSupabaseClient`/
 * `adminDataSource` deste módulo, e é importado por `AdminSessionProvider`
 * (client boundary raiz do Admin, montado em `app/layout.tsx`) — a ordem de
 * avaliação de módulos ES garante que este arquivo roda primeiro.
 *
 * ⚠️ **Débito registrado (bloqueante só de `next build` com
 * `DATA_SOURCE=supabase`, não do modo padrão/mock):** com
 * `DATA_SOURCE=supabase` definido no ambiente do processo, `next build`
 * (Turbopack E webpack, reproduzido nos dois) falha ao prerenderizar
 * páginas SEM NENHUMA relação com Admin/Supabase (`/hubs/novo`,
 * `/_global-error`) com `TypeError: Cannot read properties of null
 * (reading 'useState')`. Isolado por bisecção (`--debug-build-paths`,
 * guarda `typeof window !== 'undefined'` neste módulo — não corrige, então
 * NÃO é efeito colateral de `createClient()` rodando de verdade) a algo na
 * combinação Turbopack/webpack + o padrão `if (process.env.DATA_SOURCE ===
 * 'supabase')` presente em `packages/core-data/src/index.ts#resolveDataSource`
 * quando esta env var está definida no ambiente do build — cheira a bug de
 * dead-code-elimination do bundler, não a um erro de lógica desta Story
 * (`next build` sem `DATA_SOURCE` no ambiente — o modo padrão do repo hoje —
 * builda 100% limpo, incluindo `/aprovacoes`/`/aprovacoes/[id]`). Registrado
 * para @qa/@architect; não bloqueia `Done` desta Story (mesmo padrão de
 * registro de lacuna de ambiente já usado nas Stories 2.5.1/2.6/3.2/3.5).
 */
const dataSource = process.env.DATA_SOURCE?.trim() === 'supabase' ? 'supabase' : 'mock';

let sharedSupabaseClient: SupabaseClient<Database> | null = null;

if (dataSource === 'supabase') {
  try {
    sharedSupabaseClient = createClient();
    getDataClient({ source: 'supabase', supabaseClient: sharedSupabaseClient });
  } catch (error) {
    console.warn('[dataClientBootstrap] falha ao inicializar o client Supabase — caindo para mock:', error);
    sharedSupabaseClient = null;
    getDataClient({ source: 'mock' });
  }
}

/** `'supabase'` só quando `DATA_SOURCE=supabase` E a inicialização do client não falhou. */
export const adminDataSource: 'mock' | 'supabase' = dataSource === 'supabase' && sharedSupabaseClient ? 'supabase' : 'mock';

/**
 * Instância ÚNICA de `SupabaseClient` compartilhada por todo o Admin quando
 * `adminDataSource === 'supabase'` — a MESMA repassada a
 * `getDataClient({ supabaseClient })` acima. `adminAuth.ts` reaproveita esta
 * função (em vez de chamar `createClient()` de novo) para que
 * login/logout/`onAuthStateChange` observem EXATAMENTE a mesma sessão que
 * `admin.supabase.ts` usa para autorizar `pendingStores`/`pendingStoreDetail`
 * sob RLS. `null` em modo mock ou se a inicialização falhou.
 */
export function getAdminSupabaseClient(): SupabaseClient<Database> | null {
  return sharedSupabaseClient;
}
