/**
 * Story 6.6 (Bloco 06) — [IDS] ADAPT do mesmo padrão já validado em
 * `apps/lojista/src/lib/dataSource.ts` (Stories 3.11/3.12): helper
 * reaproveitável para telas do app Cliente decidirem entre a fonte de
 * dados real (`@keepit/core-data`, `DATA_SOURCE=supabase`) e o
 * comportamento mock preservado (`DATA_SOURCE=mock`), sem repetir a
 * checagem de env var em cada tela (`Pagamento.tsx`, Story 6.6).
 *
 * CREATE (não REUSE direto do arquivo do Lojista) — cada app Expo só
 * inlineia no bundle as `EXPO_PUBLIC_*` que ele próprio referencia em
 * tempo de build; não há um pacote `@keepit/env` compartilhado neste
 * monorepo. Mesma decisão já tomada por `dataClientBootstrap.ts` (Story
 * 2.5.1), que lê `process.env.EXPO_PUBLIC_DATA_SOURCE` diretamente dentro
 * de `apps/cliente`, em vez de importar de `apps/lojista`.
 */
export function isSupabaseDataSource(): boolean {
  return process.env.EXPO_PUBLIC_DATA_SOURCE?.trim() === 'supabase';
}
