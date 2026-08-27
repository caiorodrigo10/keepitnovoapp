---
name: asaas-base-url-safe-default-deferred
description: AC2 da 7.1 (derivação safe da base URL Asaas) foi adiada sem dono DONE; cobrar como AC da 7.2 antes de PIX real
metadata:
  type: project
---

O client `_shared/asaas.ts` (Story 7.1, gate CONCERNS 2026-08-27) é portável/injetável por decisão da missão: `createAsaasClient({ baseUrl, apiKey, fetchImpl? })` recebe config já resolvida e **não lê `Deno.env` nem deriva a base URL**.

Isso deixou o AC2 literal da 7.1 (leitura de env + derivação **safe**: sandbox por default, produção SÓ com `ASAAS_ENVIRONMENT==='production'`, override por `ASAAS_BASE_URL`, "nunca produção por omissão") sem implementação em nenhuma story DONE — registrado como CARRY-001 no gate `docs/qa/gates/7.1-asaas-client.yaml`.

**Why:** é um default de segurança financeira (mandar dinheiro real por engano se cair em produção por omissão). Corre risco de se perder no handoff 7.1 → 7.2/7.5.

**How to apply:** ao revisar a Story 7.2 (ou o passo do PaymentPort/entrypoint da Edge Function), exigir que a montagem do `AsaasClientConfig` a partir de `Deno.env.get(...)` implemente E teste explicitamente essa derivação safe. Se a 7.2 não cobrir, é FAIL de segurança, não detalhe implícito. Ver também CARRY-002 (shape de `POST /v3/transfers` best-effort, não verificado contra sandbox). Relacionado: [[feedback_pnpm_qa_cache_mascara]] (o `pnpm qa` voltou FULL TURBO nesta review; vitest do pacote foi reexecutado direto).
