---
name: project-build001-admin-next16
description: BUILD-001 — Admin next build em DATA_SOURCE=supabase é bloqueado por bug upstream do Next 16 no prerender de /_global-error; correção real (Opção 1) é breaking e foi adiada
metadata:
  type: project
---

BUILD-001: o `next build` do app Admin em `DATA_SOURCE=supabase` só passa parcialmente.

**Fato:** @architect aplicou `export const dynamic = 'force-dynamic'` no root layout do Admin (`apps/admin/app/layout.tsx`) em 2026-08-12. Isso tira as 12 rotas reais do static prerender (contagem de páginas estáticas caiu de 13→1) e resolve os crashes `useState null`. Sobra APENAS `/_global-error`, arquivo especial do Next 16 que não herda segment config e é sempre prerenderizado — o grafo `@supabase/supabase-js` avaliado no worker de static-generation corrompe o singleton react-ssr (`useContext null`). É bug de framework UPSTREAM (vercel/next.js #84994, #85668, #86178), reproduzido em 16.2.12 e 16.3.0, Turbopack e webpack. Build mock (default) passa 100%.

**Why:** O gate/story 3.7 registrou BUILD-001 como infra pendente. O piloto Android + admin interno precisam de um caminho de deploy. Testados e REPROVADOS para `/_global-error`: serverExternalPackages, output:standalone, experimental.dynamicIO, global-error custom, mover o AdminSessionProvider p/ fora do root layout, bump p/ Next 16.3.0. Único fix de código = Opção 1 (dynamic import dos adapters supabase em `packages/core-data`, tornando `getDataClient()` async) — BREAKING nas 3 apps (cliente/lojista/admin consomem síncrono), adiada por decisão de escopo (requer checkpoint com @dev).

**How to apply:** Não re-investigar `/_global-error` como bug de app — é upstream. Deploy do Admin em modo supabase no piloto: usar `next dev` (sem prerender, funciona) OU agendar rodada dedicada da Opção 1. `force-dynamic` já é pré-requisito e é a estratégia de render correta para um painel auth-gated (perda de static export é irrelevante p/ ferramenta interna). Débito atualizado em `docs/qa/gates/3.7-admin-listar-lojistas-pendentes.yaml` (campo `architect_resolution`), rebaixado high→medium. Trigger real: `useAdminHubs`/`useAdminPendingStores` chamam `getDataClient()` no corpo do render.
