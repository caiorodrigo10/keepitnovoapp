---
name: feedback-shared-types-manual-reconciliation
description: This environment has no SUPABASE_ACCESS_TOKEN — every new table/view/RPC needs a hand-written entry in packages/shared-types/src/supabase.ts, mirroring the applied migration exactly
metadata:
  type: feedback
---

`packages/shared-types/src/supabase.ts` cannot be regenerated with
`supabase gen types` in this environment (no `SUPABASE_ACCESS_TOKEN`/CLI
login available). Every block that adds a new table, view, or RPC via MCP
`apply_migration` needs a **manual** reconciliation entry in that file, or
the TypeScript adapters that consume it via `supabase-js` will not
typecheck (`.from('new_table')` / `.rpc('new_fn')` require the name to
exist in `Database['public']['Tables'|'Views'|'Functions']`).

**Why:** confirmed by reading the file's own header comments — this pattern
has been used consistently since Story 2.8 (2026-07-31) through Bloco 08
(2026-08-13), roughly one reconciliation block per migration-adding story.

**How to apply:** when a new migration creates a table/view/function that an
adapter needs to query:
1. Read the actual applied migration SQL (not the story text) — the DDL is
   the source of truth for column names/types/nullability.
2. Add a numbered comment block at the top of `supabase.ts` documenting
   which story/migration this reconciles (follow the exact prose style
   already there — story ref, migration filenames, why manual).
3. Add the `Tables`/`Views`/`Functions` entry mirroring the DDL exactly —
   `Relationships: []` unless the adapter does a typed PostgREST embed
   (it usually doesn't in this codebase; adapters do separate queries
   instead, e.g. `fetchItensPorPedidoIds` pattern in `order.supabase.ts`).
4. Views only need a `Row` shape (no `Insert`/`Update`).
5. RPCs returning `TABLE (...)` map to `Returns: { ... }[]`; RPCs with no
   params use `Args: Record<PropertyKey, never>`.

Do this BEFORE writing the adapter — the adapter's typecheck depends on it.
