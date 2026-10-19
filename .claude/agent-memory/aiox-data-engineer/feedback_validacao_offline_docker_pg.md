---
name: validacao-offline-docker-pg
description: Como validar migrations do keepit sem MCP — Postgres efêmero via docker + stubs Supabase
metadata:
  type: feedback
---

Quando eu (Dara) escrevo migrations mas NÃO tenho MCP (o orquestrador aplica no keepit-dev), posso validar sintaxe E semântica (nomes de coluna, FKs, corpos plpgsql em runtime) localmente com um Postgres efêmero.

**Why:** plpgsql só valida referências a tabelas/colunas em RUNTIME, não no CREATE FUNCTION. Aplicar limpo != funcionar. Um smoke test de execução pega erros que o applier do orquestrador só veria ao rodar.

**How to apply:**
1. `docker run -d --rm --name pgcheck -e POSTGRES_PASSWORD=postgres postgres:15`
2. Bootstrap de stubs Supabase: roles `anon/authenticated/service_role/supabase_auth_admin`; schemas `auth` e `extensions`; `CREATE EXTENSION pgcrypto SCHEMA extensions` (crypt/gen_salt/gen_random_bytes); `auth.users` mínima (id, raw_user_meta_data); `auth.uid()` lendo `current_setting('request.jwt.claim.sub', true)::uuid`.
3. Aplicar SÓ a cadeia mínima de migrations pré-requisito (as que criam as tabelas/funções que os novos arquivos tocam), pulando as com Supabase-isms não relacionados (storage, auth.admin, horarios). `pedidos_itens` exige `produtos`.
4. Simular usuários com `SET request.jwt.claim.sub = '<uuid>'`; simular role com `SET ROLE authenticated` (precisa `GRANT ... TO authenticated` na tabela, que o Supabase dá por padrão mas o PG vanilla não).
5. Testar erros nomeados, guards (is_admin), idempotência, RLS (admin vê / não-admin vê 0).

Funcionou 100% no Bloco 09 (21 smoke tests). Scripts descartáveis no scratchpad. Ver também [[nao-aplicar-no-supabase-sem-autorizacao]].
