# Épico 7 — Ligar o PIX real (sandbox) · guia de release

> Criado 2026-08-27 ao fim da cadeia PIX offline (Stories 7.1/7.2/7.5/7.11 Done).
> Todo o código está construído e testado offline (`pnpm qa` verde). Este guia é
> o que falta para o PIX **funcionar de verdade** contra o sandbox Asaas.
> Branch: `feat/epic7-pagamento-asaas`.

## O que já está pronto (offline, testado em vitest)

| Story | Entrega | Testes |
|---|---|---|
| 7.1 | `_shared/asaas.ts` — client HTTP (criarCliente, criarCobranca PIX, obterQrCodePix, estornar, transferir) | 15 |
| 7.2 | Edge Function `create-pix-payment` + `PaymentPort` + migration colunas Asaas + default seguro de URL | 23 |
| 7.5 | Edge Function `asaas-payment-webhook` (PAYMENT_RECEIVED/CONFIRMED) + RPC `confirmar_pagamento_pedido` (auth fail-closed, idempotente) | 11 |
| 7.11 | ramo CHARGEBACK + RPC `registrar_chargeback_pedido` (débito no ledger único + falha) | 9 |

Credenciais sandbox já salvas em `.env.asaas` (gitignored): `ASAAS_API_KEY`, `ASAAS_WALLET_ID`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL`, `ASAAS_ENV=sandbox`.

## Passo a passo para ligar (ordem)

### 1. ASAAS-1 — aprovar a conta sandbox — **Caio (painel)**
Em `sandbox.asaas.com`, concluir o cadastro comercial / aprovar. Enquanto `AWAITING_APPROVAL`, criar cobrança PIX retorna "conta precisa estar aprovada".

### 2. ASAAS-2 — setar os secrets no Supabase `keepit-dev` — **Caio (~1 min)**
As Edge Functions leem via `Deno.env.get(...)` — não do `.env.asaas` local. Rodar com a Supabase CLI logada no projeto `keepit-dev` (valores reais em `.env.asaas`):

```bash
supabase secrets set \
  ASAAS_API_KEY="<valor de .env.asaas>" \
  ASAAS_WEBHOOK_TOKEN="<valor de .env.asaas>" \
  ASAAS_BASE_URL="https://api-sandbox.asaas.com/v3" \
  ASAAS_ENVIRONMENT="sandbox" \
  --project-ref <ref do keepit-dev>
```
> Não commitar valores. `ASAAS_ENVIRONMENT` ausente/≠`production` já cai em sandbox por design (default seguro, CARRY-001).

### 3. Aplicar as migrations no `keepit-dev` — **@data-engineer / @devops** (DEPLOY-001)
Três migrations novas desta cadeia:
- `20260814000004_pedidos_add_asaas_pix.sql`
- `20260814000005_rpc_confirmar_pagamento_pedido.sql`
- `20260814000006_rpc_registrar_chargeback_pedido.sql`

Via MCP `apply_migration` ou `supabase db push`. Conferir `list_migrations` antes/depois.

### 4. Deploy das 2 Edge Functions — **@devops** (via MCP `deploy_edge_function` ou CLI)
- `create-pix-payment`
- `asaas-payment-webhook` (lembrar do `verify_jwt=false` já no `config.toml`)

### 5. Registrar o webhook no Asaas — **@devops/script** (não é painel)
`POST /v3/webhooks` com `url` da function `asaas-payment-webhook`, `events: [PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_CHARGEBACK_REQUESTED]`, e `authToken = ASAAS_WEBHOOK_TOKEN`.

### 6. "Religamento" — story nova (Draft) — **@sm→@dev→@qa**
A cadeia hoje está **dormente por design**: `criar_pedido` ainda grava `status='aguardando_aceite'` (pula pagamento). A story de religamento deve, com os itens 1–5 prontos:
- editar `criar_pedido`/`criar_pedido_com_ledger` para nascer `aguardando_pagamento` em modo supabase;
- exibir o QR REAL do Asaas (hoje a UI mostra o QR fake nos dois modos);
- **fechar os carry-forwards de segurança** acumulados nos gates:
  - **AUTHZ-001** — ownership/auth na `create-pix-payment` (hoje disparável com anon key).
  - **IDEMP-001** (parcial) — dedup por `externalReference` contra falha parcial de criação.
  - **CB-001** — confirmar com stakeholder quando aplicar a penalidade de chargeback (estados terminais).
  - **QR-ASYNC-001** (achado do smoke test sandbox 2026-08-28) — logo após `criarCobranca`, o `GET /payments/{id}/pixQrCode` pode retornar `success:null` + campos `null` por um instante (QR gerado async). O handler `create-pix-payment` chama `obterQrCodePix` imediatamente → adicionar **retry/poll curto** (ex.: até 3 tentativas com backoff) antes de persistir/retornar. Sem isso, o primeiro pedido pode salvar `qr_code_pix`/`pix_copia_e_cola` nulos.

### 7. E2E sandbox (DoD do épico) — **@qa**
PIX gera QR → paga no sandbox → webhook chega → pedido `aguardando_aceite` → PIN → carteira. Chargeback no sandbox → débito de R$40 reflete na `carteira_lojista`.

## Pendências de negócio (não bloqueiam o sandbox, bloqueiam produção)
- **PAY-01** — ratificar taxa R$ 2,90 (stakeholder).
- **Q1.8** — mecânica do reembolso parcial (6.18/6.19).
- **Cartão/tokenização** (7.3/7.4) e **subconta por lojista** — modelo-alvo pós-piloto.

## Merge do branch
`feat/epic7-pagamento-asaas` (4 commits) → PR para `main` quando você aprovar. Operação do @devops.
