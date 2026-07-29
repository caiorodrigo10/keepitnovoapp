# `src/supabase/`

Esqueleto da implementação Supabase das 8 ports de `@keepit/core-data`
(Story 1.9 — `docs/stories/1.9.story.md`). Cada arquivo implementa a MESMA
interface já definida em `../ports/*.port.ts` (Story 0.2 + extensão da
Story 1.10), usando `createClient()` de `@keepit/supabase-client` (anon key,
respeita RLS — nunca `createServiceRoleClient()` aqui).

| Arquivo | Port | Épico responsável pela implementação real |
|---|---|---|
| `auth.supabase.ts` | `AuthPort` | Épico 2 |
| `hub.supabase.ts` | `HubPort` | Épico 5 |
| `store.supabase.ts` | `StorePort` | Épico 5 (leitura) / Épico 4 (`setPausadoManualmente`) |
| `product.supabase.ts` | `ProductPort` | Épico 4 |
| `order.supabase.ts` | `OrderPort` | Épico 6 |
| `wallet.supabase.ts` | `WalletPort` | Épico 7 |
| `admin.supabase.ts` | `AdminPort` | Épico 3 (`pendingStores`/`approve`/`reject`), Épico 4 (`hubsCrud`), Épico 8 (demais) |
| `analytics.supabase.ts` | `AnalyticsPort` | Épico 7 |

## Estado atual — esqueleto, não implementação real

**Todo método hoje lança `NotImplementedError`** (`not-implemented-error.ts`),
identificando port + método + épico responsável. Nenhuma tabela de domínio
real (`clientes`, `hubs`, `estabelecimentos`, `produtos`, `pedidos`, etc.)
existe hoje em `apps/supabase/migrations/` — só `_canary` (Story 1.4). Os
épicos 2–9 substituem cada stub pela query/mutação real, port por port, à
medida que a tabela correspondente nascer.

`createDataClient({ source: 'supabase' })` (ver `../index.ts`) já resolve
para estes 8 adaptadores — chamar qualquer método de fato dispara
`NotImplementedError`, o que é esperado e correto até o épico
correspondente preencher o método. `createDataClient()`/`{ source: 'mock' }`
continua intacto e é o que os 3 apps usam hoje (nenhum app passa `source`
explicitamente).

## Instanciação do `SupabaseClient`

Cada `create*Supabase(client?)` aceita um client opcional (útil para testes)
e, se omitido, resolveria um novo `createClient()` sob demanda (lazy) — nunca
um singleton global do módulo. Como nenhum método real ainda toca a rede
(são stubs), essa resolução lazy nunca é de fato exercitada hoje; isso é
proposital, para que `pnpm turbo run typecheck`/`test` não exijam
`SUPABASE_URL`/`SUPABASE_ANON_KEY` configuradas apenas para validar o
esqueleto.
