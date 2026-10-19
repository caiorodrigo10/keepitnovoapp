# Asaas Sandbox — 2 passos que dependem do Caio (para o PIX real ligar)

Contexto: chave sandbox recebida e testada (2026-08-13). Chave/token vivem em `.env.asaas`
na raiz (gitignored, NUNCA commitar). Cliente Asaas criável ✅, webhooks via API ✅.
**Bloqueio para cobrança PIX:** a conta sandbox está `AWAITING_APPROVAL`.

## Passo 1 — Aprovar a conta sandbox no Asaas
No painel `sandbox.asaas.com`, completar o cadastro comercial / aprovar a conta.
Enquanto `AWAITING_APPROVAL`, criar cobrança PIX retorna:
"O Pix não está disponível no momento. Para utilizá-lo, sua conta precisa estar aprovada."
→ Sem isso, o `create-pix-payment` deploya mas não gera cobrança de verdade.

## Passo 2 — Setar os secrets no Supabase `keepit-dev`
Project Settings → Edge Functions → Secrets (ou `supabase secrets set`):
- `ASAAS_API_KEY` = (valor em `.env.asaas`)
- `ASAAS_WEBHOOK_TOKEN` = (valor em `.env.asaas`, gerado por mim — o webhook exige esse header)
- `ASAAS_BASE_URL` = `https://api-sandbox.asaas.com/v3`
Não há ferramenta MCP para setar secret — por isso é seu (1 min). As Edge Functions
`create-pix-payment` / `asaas-payment-webhook` leem via `Deno.env.get(...)`; eu nunca vejo os valores.

## O que EU já deixo pronto (sem você)
- Build + deploy das 2 Edge Functions (via MCP).
- Registro do webhook via API (`POST /v3/webhooks`, evento `PAYMENT_RECEIVED`, com o token) — você NÃO mexe no painel Asaas pra isso.
- Fiação do checkout: "Pagar" (modo supabase) → `create-pix-payment` → QR/copia-e-cola; pedido nasce `aguardando_pagamento`; webhook confirma → `aguardando_aceite` + ledger.
- Verificação contra o sandbox de tudo que der antes da aprovação (cliente, shape da API, webhook).

**Com os 2 passos acima, o PIX real (sandbox) liga ponta-a-ponta.**
