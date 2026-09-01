---
name: asaas-base-url-safe-default-deferred
description: Cadeia Asaas — CARRY-001 fechado na 7.2; AUTHZ-001/IDEMP-001 chegam na 7.5 (webhook). IDEMP-001 fechado; AUTHZ-001 fechado SÓ no webhook (gap do create-pix-payment segue aberto)
metadata:
  type: project
---

**RESOLVIDO na Story 7.2 (gate CONCERNS 2026-08-27).** `create-pix-payment/config.ts#resolveAsaasConfig(env: EnvReader)` implementa a derivação safe: `ASAAS_BASE_URL` (não-vazio pós-trim) sempre vence; senão `ASAAS_ENVIRONMENT==='production'` exato → prod, QUALQUER outro valor (ausente/vazio/typo) → sandbox. 8 casos em `config.test.ts` reexecutados sem cache pelo @qa (incl. typo→sandbox, API_KEY ausente→''). O default "nunca produção por omissão" agora vive em código DONE e testado. Só o `index.ts` faz a ponte `Deno.env.get`.

Contexto histórico: o client `_shared/asaas.ts` (Story 7.1) foi feito portável/injetável (`createAsaasClient({ baseUrl, apiKey, fetchImpl? })`) e não lia `Deno.env` — por isso o AC2 literal da 7.1 ficou sem dono DONE (CARRY-001 no gate `docs/qa/gates/7.1-asaas-client.yaml`). A 7.2 fechou isso.

**Why:** default de segurança financeira (mandar dinheiro real por engano se cair em produção por omissão).

**How to apply:** CARRY-001 não é mais pendência. Cadeia de carry-forwards da 7.2 (`docs/qa/gates/7.2-create-pix-payment.yaml`) — **AUTHZ-001** e **IDEMP-001** — chegou na **Story 7.5 (gate CONCERNS, `docs/qa/gates/7.5-asaas-payment-webhook.yaml`, 2026-08-27)**:

- **IDEMP-001 FECHADO** na 7.5 pela RPC `confirmar_pagamento_pedido` (`SELECT ... FOR UPDATE` + checagem de status na mesma transação; `GRANT` só a `service_role`; 1ª RPC do projeto restrita a service_role). RESSALVA (REL-001, LOW): a serialização SQL **não é exercitada por teste** (sem Postgres local) — o handler testa só o mapeamento com repo mockado; validar concorrência real ao aplicar a migration.
- **AUTHZ-001 fechado SÓ no nível do webhook** — a 7.5 criou um endpoint novo (`asaas-payment-webhook`) autenticado por segredo compartilhado (`asaas-access-token`, fail-closed, `verify_jwt=false` escopado). **NUANCE IMPORTANTE:** o gap ORIGINAL do AUTHZ-001 (a Edge Function `create-pix-payment` sem checagem de ownership, disparável com anon key) **continua aberto** — a 7.5 não tocou `create-pix-payment`. Não assumir que a auth do `create-pix-payment` foi corrigida; endereçar na story de religamento/PIX real.

Story 7.5 fica **dormant** em prod até a story de religamento editar `criar_pedido` (bloqueada por ASAAS-1/ASAAS-2). Comparação de token na 7.5 não é timing-safe (SEC-001, aceito no piloto). Ver também [[project_signed_url_rls_admin]] (padrão de gap de autorização client-side). Relacionado: [[feedback_pnpm_qa_cache_mascara]] (o `pnpm qa` voltou FULL TURBO de novo; vitest reexecutado direto por pacote — 41/41) e [[project_migration_pendente_stale]] (migration 20260814000005 não aplicada, apply out-of-band via MCP).
