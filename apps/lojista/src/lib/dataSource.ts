/**
 * Story 3.11/3.12 (Data Mode) — [IDS] ADAPT do gate `EXPO_PUBLIC_DATA_SOURCE`
 * já usado por `dataClientBootstrap.ts` (Story 3.2), extraído para um helper
 * reaproveitável por telas que precisam decidir entre a fonte de dados real
 * (`@keepit/core-data`, `DATA_SOURCE=supabase`) e o estado local em memória
 * herdado da Story 0.8 (`LojaPerfilContext`/`lojaPerfilDraft.ts`,
 * `DATA_SOURCE=mock`).
 *
 * [AUTO-DECISION] Screen-level check em vez do padrão "porta uniforme" já
 * usado por `Login.tsx`/`CadastroPasso1.tsx` (que chamam `getDataClient()`
 * sem checar a env var, deixando o adapter mock/Supabase absorver a
 * diferença) → (reason: `PerfilPublico.tsx`/`Configuracoes.tsx` usam
 * `LojaPerfilContext`, um estado 100% local ao app desde a Story 0.8, sem
 * NENHUMA relação com `packages/core-data` — não é uma port com dois
 * adapters (mock/Supabase) que a tela possa consumir uniformemente. A Story
 * 3.11 (Data Mode) exige explicitamente que `DATA_SOURCE=mock` preserve esse
 * Context tal como está ("sem tocar rede"); só assim as duas telas sabem
 * quando devolver ao Context em vez de chamar
 * `estabelecimentoCadastro.getMeuPerfil()`/`atualizarMeuPerfil()`.
 */
export function isSupabaseDataSource(): boolean {
  return process.env.EXPO_PUBLIC_DATA_SOURCE?.trim() === 'supabase';
}
