# `asaas-payment-webhook` — Edge Function

Recebe e valida o webhook `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` do Asaas,
avançando o pedido para `aguardando_aceite` de forma segura e idempotente.
Ver Story 7.5 (`docs/stories/7.5.story.md`) para o contexto completo — este
README cobre só "como rodar/testar", não repete os Dev Notes.

## Fluxo

1. O Asaas faz `POST` diretamente nesta função (nunca o app cliente/lojista)
   com o header `asaas-access-token` e um payload `{ event, payment: { id,
   externalReference, ... } }`.
2. `index.ts` (entrypoint `Deno.serve`) lê o header + body + env
   (`ASAAS_WEBHOOK_TOKEN`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`), monta
   um client Supabase real com a `service_role` key.
3. `handler.ts#handleAsaasWebhook` (puro, testado via Vitest): valida o
   token (AUTHZ-001, ANTES de qualquer acesso ao repositório) → parse
   defensivo do payload → filtra evento tratado → chama
   `deps.pedidos.confirmarPagamento(...)`.
4. `index.ts` chama a RPC `confirmar_pagamento_pedido` (migration
   `20260814000005`, `SECURITY DEFINER`, `FOR UPDATE`, `GRANT` só a
   `service_role`) via `supabase.rpc(...)` e traduz o resultado em `200`
   (sempre, para os casos de negócio) ou `401`/`502`.

## Decisão de arquitetura: testes em Vitest, não `deno test`

Mesma decisão das Stories 7.1/7.2: `deno` não está instalado no ambiente de
execução usado, e o gate do monorepo é `pnpm qa` (Vitest via Turbo).
`handler.ts` é 100% portável (nunca importa `Deno`) — só `index.ts` usa
`Deno.serve`/`Deno.env`, e por isso não é (nem pode ser) exercitado por
Vitest. `_shared/deno-globals.d.ts` (reusado, sem alteração) declara o
subset mínimo de `Deno` usado por `index.ts`, só para `tsc --noEmit`
typechecar este arquivo sob Node.

## Como rodar os testes offline

Da raiz do monorepo:

```bash
pnpm --filter @keepit/supabase test
# ou, direto no workspace:
cd apps/supabase && pnpm vitest run
```

Isso roda `handler.test.ts` (10 casos — auth ok/ausente/inválida/env vazio,
`PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` felizes, reentrância/idempotência,
pedido não encontrado, payload inválido/malformado, evento não tratado,
falha da RPC → 502) — todos 100% offline (nenhuma chamada de rede real,
`pedidos` sempre um fake injetado). A RPC em si (SQL) não é exercitada por
Vitest (sem Postgres local no ambiente de execução) — fica coberta por
revisão manual + o handler testado com o repositório mockado simulando os 3
resultados possíveis da RPC.

## Como testar manualmente contra o sandbox real

**Bloqueado hoje por `ASAAS-1`/`ASAAS-2`** (conta sandbox aprovada + secrets
`ASAAS_WEBHOOK_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` nos secrets do Supabase
`keepit-dev`), mesmos itens que já bloqueiam a verificação manual das
Stories 7.1/7.2. Quando resolvidos, o roteiro é:

1. Registrar o webhook no Asaas (`POST /v3/webhooks` ou painel) com a URL
   `https://<project-ref>.supabase.co/functions/v1/asaas-payment-webhook`,
   os eventos `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` e um `authToken` de
   32–255 caracteres — esse valor É o `ASAAS_WEBHOOK_TOKEN`.
2. Aplicar a migration `20260814000005_rpc_confirmar_pagamento_pedido.sql`
   (via `supabase db push` ou MCP, fora desta Story — @devops/@aiox-master).
3. **Nota**: como `criar_pedido` ainda grava `status='aguardando_aceite'`
   literal (não `'aguardando_pagamento'` — ver "Reconciliação com o épico"
   da Story 7.5), nenhum pedido real hoje chega a `aguardando_pagamento`. A
   verificação ponta-a-ponta completa (pedido nasce aguardando pagamento →
   PIX confirmado → webhook promove) só é possível depois de uma Story de
   religamento futura, bloqueada pelos mesmos ASAAS-1/ASAAS-2.
4. Para validar a Edge Function isoladamente hoje, é possível simular uma
   chamada do Asaas diretamente (fora do fluxo real de pedido):
   ```bash
   curl -i -X POST 'https://<project-ref>.supabase.co/functions/v1/asaas-payment-webhook' \
     -H 'asaas-access-token: <ASAAS_WEBHOOK_TOKEN>' \
     -H 'Content-Type: application/json' \
     -d '{"id":"evt_teste","event":"PAYMENT_RECEIVED","payment":{"id":"pay_teste","externalReference":"<id-de-pedido-existente>"}}'
   ```
   Contra um pedido real (que hoje está em `aguardando_aceite`), a resposta
   esperada é `200 {"ok":true,"resultado":"ja_processado", ...}` — comportamento
   correto e seguro (não duplica o `charge` já gravado na criação).

## Segurança

- Auth por segredo compartilhado (`asaas-access-token` vs.
  `ASAAS_WEBHOOK_TOKEN`), comparada ANTES de qualquer acesso ao repositório
  (AUTHZ-001). Fail-closed: token de ambiente vazio nunca "casa" com header
  ausente/vazio.
- Idempotência via `SELECT ... FOR UPDATE` + checagem de status na MESMA
  transação da RPC (IDEMP-001) — 2 entregas do mesmo evento (Asaas "at least
  once") nunca duplicam o `charge` no ledger.
- `confirmar_pagamento_pedido` é a primeira RPC do projeto `GRANT`ada só a
  `service_role` — nunca `authenticated`/`anon`/`PUBLIC`.
- Nenhum segredo (`ASAAS_WEBHOOK_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) é
  logado ou incluído em mensagens de erro.
- `verify_jwt = false` (`config.toml`) é restrito a esta função — o Asaas
  não envia JWT do Supabase, só o header próprio.
