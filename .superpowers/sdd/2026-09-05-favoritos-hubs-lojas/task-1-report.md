# Task 1 report — favoritos Supabase isolados por cliente

Data: 2026-09-05
Projeto remoto: `keepit-dev` (`jhhbewnmnorhmsdvfppo`)
Migration canônica: `20260905151737_cliente_favoritos`

## Resultado

- Criadas `public.clientes_hubs_favoritos` e
  `public.clientes_estabelecimentos_favoritos`, ambas com PK composta, FKs
  `ON DELETE CASCADE`, `criado_em timestamptz NOT NULL DEFAULT now()` e índice
  no ID do recurso.
- RLS está `ENABLE` + `FORCE`. `authenticated` tem somente
  `SELECT, INSERT, DELETE`, com policy por operação e ownership por
  `(SELECT auth.uid()) = cliente_id`. `anon` não possui grant; não existe grant
  nem policy de `UPDATE`.
- A descoberta anônima continua lendo apenas hubs ativos e seus horários.
  `authenticated` também pode reler um hub inativo e seus horários quando o
  próprio cliente já o favoritou. A policy dos favoritos não consulta `hubs`,
  portanto não há ciclo de RLS.
- Nenhum client/service role foi criado ou usado no código desta tarefa.

## Evidência de execução remota

O CLI oficial não existe neste ambiente (`command -v supabase` sem resultado),
então foi usado o fallback MCP autorizado.

1. Snapshot lógico pré-migration:
   - projeto `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.147`;
   - as duas relações de favoritos não existiam;
   - último histórico remoto era `20260814020627_rpc_cancelar_pedido_atraso`;
   - policies vigentes permitiam hub inativo apenas a admin.
2. TDD RED: o teste transacional falhou antes da migration com PostgreSQL
   `42P01`, `relation "public.clientes_hubs_favoritos" does not exist`.
3. `supabase_apply_migration(name='cliente_favoritos')` retornou
   `{"success":true}`.
4. A leitura imediata de `supabase_list_migrations` devolveu a versão canônica
   `20260905151737_cliente_favoritos`; somente depois disso foi criado o arquivo
   local `20260905151737_cliente_favoritos.sql` com a mesma query aplicada.
5. TDD GREEN: o SQL transacional completo executou sem erro. Ele cobre as duas
   relações: inserir/listar/apagar do próprio usuário, duplicata com
   `ON CONFLICT DO NOTHING`, invisibilidade entre `user_a`/`user_b`, rejeição de
   ownership forjado, ausência de `UPDATE`, ausência de SELECT/INSERT/DELETE
   para `anon`, visibilidade privada de hub inativo favorito e preservação da
   descoberta pública de hub ativo.
6. Readback do catálogo confirmou:
   - RLS enabled/forced em ambas as relações;
   - 2 PKs compostas e 4 FKs `ON DELETE CASCADE`;
   - índices reversos
     `idx_clientes_hubs_favoritos_hub` e
     `idx_clientes_estabelecimentos_favoritos_estabelecimento`;
   - exatamente seis policies privadas, todas `TO authenticated`;
   - grants de app somente `DELETE, INSERT, SELECT` para `authenticated`;
   - nenhum grant de favoritos para `anon`;
   - zero linhas de fixture em `auth.users`, `hubs`, `estabelecimentos` e nas
     duas relações após o `ROLLBACK`.

## Advisors

Comparação imediatamente antes/depois da migration:

| Advisor | Antes | Depois | Erros | Observação da tarefa |
|---|---:|---:|---:|---|
| Security | 24 WARN | 24 WARN | 0 | nenhum finding novo/relacionado |
| Performance | 108 total / 84 WARN | 102 total / 76 WARN | 0 | 2 INFO de índice ainda não usado; 2 WARN de policies permissivas sobrepostas |

Os `unused_index` são esperados em tabelas novas e vazias; os índices são
necessários para a direção reversa das FKs e para o lookup do hub favorito.
Referência: [Supabase lint 0005](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Os dois `multiple_permissive_policies` em `hubs`/`hubs_horarios` refletem a
sobreposição já existente entre a policy administrativa `FOR ALL` e a policy de
leitura. A divisão nova entre `TO anon` e `TO authenticated` reduziu o total de
findings de performance em vez de ampliá-lo. Eliminar o aviso exigiria refatorar
as policies administrativas existentes para uma policy por operação, fora do
escopo desta migration. Referência:
[Supabase lint 0006](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).

## Drift de tipos gerados — decisão explícita

O output oficial do MCP contém as duas relações novas, mas o `keepit-dev` ainda
não recebeu três migrations locais do Épico 7:

- `20260814000004_pedidos_add_asaas_pix.sql`: adiciona a `pedidos` as colunas
  nullable `asaas_payment_id` (UNIQUE), `qr_code_pix`, `pix_copia_e_cola`, o
  índice parcial `idx_pedidos_asaas`, e muda o default de status para
  `aguardando_pagamento`;
- `20260814000005_rpc_confirmar_pagamento_pedido.sql`: RPC
  `SECURITY DEFINER`, serializada por `FOR UPDATE`, que depende da migration
  anterior e de `lancamentos_financeiros`; execução somente por `service_role`;
- `20260814000006_rpc_registrar_chargeback_pedido.sql`: RPC
  `SECURITY DEFINER`, serializada por `FOR UPDATE`, que depende da primeira,
  de `lancamentos_financeiros` e de `estabelecimentos_falhas`; execução somente
  por `service_role`.

O readback remoto confirmou que os três pais existem e que
`estornado_chargeback` já está no CHECK de `pedidos.status`, mas as três colunas
e as duas RPCs estão ausentes e o default continua `aguardando_aceite`.

Essas migrations não foram aplicadas: o runbook
`docs/orchestration/EPICO7-LIGAR-SANDBOX.md` as coloca dentro de uma sequência de
release Asaas que exige aprovação da conta sandbox, secrets, deploy das Edge
Functions e registro do webhook. Aplicá-las aqui avançaria outro release fora
do escopo. Riscos documentados incluem o default latente de
`aguardando_pagamento` e `CB-001` (chargeback hoje debita qualquer estado que
não seja `estornado_chargeback`).

Por decisão do coordenador, `packages/shared-types/src/supabase.ts` preserva
verbatim as definições forward-schema já versionadas e incorpora somente os
dois blocos de tabelas produzidos pelo gerador oficial. Esse overlay está
identificado no cabeçalho do arquivo e não contém tipos inventados. Custo da
decisão: regenerar o arquivo inteiro pelo CLI/MCP oficial assim que o histórico
do `keepit-dev` alcançar as migrations locais 00004–00006.

## Verificações locais

- `pnpm --filter @keepit/shared-types typecheck` — PASS.
- `pnpm --filter @keepit/supabase typecheck` — PASS após preservar o overlay
  forward-schema.
- `pnpm --filter @keepit/core-data typecheck` — PASS.
- `pnpm typecheck` — PASS (9/9 tasks).
- `pnpm test` — PASS (9/9 tasks; suites executadas: Supabase 50, Core Data
  603, Cliente 301; demais workspaces verdes/skipped conforme scripts).
- `pnpm lint` — PASS (9/9 tasks; scripts atuais são `echo skipped`).
- `pnpm build` — PASS (9/9 tasks; scripts atuais são `echo skipped`, com os
  warnings já esperados de ausência de outputs no Turbo).
- `git diff --check` — PASS.
- CodeRabbit CLI não está instalado neste ambiente (`coderabbit unavailable`);
  a revisão independente fica para o coordenador/QA.
