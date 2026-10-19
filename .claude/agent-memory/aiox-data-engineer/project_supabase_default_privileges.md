---
name: project-supabase-default-privileges
description: Keepit migrations never GRANT table-level SELECT to anon/authenticated — they rely on Supabase's public-schema default privileges
metadata:
  type: project
---

As migrations do Keepit (`apps/supabase/supabase/migrations/`) **nunca** dão `GRANT ... ON TABLE` explícito para `anon`/`authenticated`. Elas confiam nas *default privileges* que o Supabase configura no init do projeto (`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role`). O RLS (ENABLE + FORCE + policies) é o que filtra as linhas; o privilégio de tabela vem do default.

**Why:** É o padrão do Supabase; replicá-lo por migration seria redundante e divergente do resto do schema.

**How to apply:** Ao validar migrations num Postgres efêmero (fora do Supabase), o bootstrap PRECISA replicar isso ANTES de rodar as migrations, senão `SET ROLE authenticated; SELECT ...` dá `permission denied` (não é bug da migration). Bootstrap mínimo que funciona: roles `anon`/`authenticated`/`service_role`, schemas `auth`/`storage`/`extensions`, extensões `pgcrypto`+`pg_trgm` em `extensions`, `auth.users` + `auth.uid()` (lê `request.jwt.claim.sub`), stubs `storage.buckets/objects/foldername`, e o `ALTER DEFAULT PRIVILEGES` acima. Inserir em `auth.users` dispara o trigger de signup que **auto-cria** a linha em `public.clientes` — não inserir clientes manualmente. Ver [[feedback-nao-aplicar-no-supabase-sem-autorizacao]].
