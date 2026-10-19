---
name: verificar-tipo-gerado-vs-schema
description: Como o QA confere um tipo Database (supabase gen types) editado à mão contra o schema real quando não há MCP Supabase nem access token
metadata:
  type: project
---

Quando o @dev edita à mão `packages/shared-types/src/supabase.ts` (o tipo `Database`
gerado) porque o arquivo ficou defasado, o QA deve confrontar o tipo com o schema
REAL antes de aceitar — tipo mentiroso quebra type-safety.

**Why:** o artefato é gerado por `supabase gen types` mas mantido à mão sem
guarda de CI; uma coluna nova numa migration passa despercebida. Na Story 2.8 o
tipo declarava a tabela `clientes` com 5 colunas.

**How to apply:** o MCP Supabase (`list_tables`/`execute_sql`) costuma NÃO estar
conectado nesta sessão (tools `mcp__supabase__*` retornam "No such tool"). Sonde
o PostgREST direto com a anon key do `.env` (`SUPABASE_URL`/`SUPABASE_ANON_KEY`):
- `GET /rest/v1/{tabela}?select={coluna}&limit=0` → HTTP 200 se a coluna existe,
  HTTP 400 "column ... does not exist" se não.
- Sonde as colunas declaradas (devem dar 200) E colunas de épicos futuros que
  NÃO devem existir ainda (devem dar 400) — assim você prova o conjunto exato,
  não só a presença.
- OpenAPI root (`GET /rest/v1/`) vem VAZIO para anon neste projeto (definitions/
  paths `[]`) — não serve para tipos; use o probing coluna a coluna.
- Nullability/tipos: confie na migration versionada (`apps/supabase/supabase/
  migrations/*.sql`) como fonte, e cheque que o tipo segue a convenção gen-types
  (uuid/text/timestamptz→string; nullable→`| null`; default/nullable→opcional no
  Insert). `Relationships: []` é fiel para FK a `auth.users` (schema auth não é
  exposto ao gen types de public).

Veredito: se as colunas batem, é CONCERNS+débito (regenerar oficialmente), não
HIGH. Ver [[prova-empirica-adapters]] para a técnica irmã (mockar o client e
contar chamadas).
