---
name: asaas-base-url-safe-default-deferred
description: CARRY-001 (derivação safe da base URL Asaas) FECHADO na 7.2 e testado; risco financeiro agora coberto por código DONE
metadata:
  type: project
---

**RESOLVIDO na Story 7.2 (gate CONCERNS 2026-08-27).** `create-pix-payment/config.ts#resolveAsaasConfig(env: EnvReader)` implementa a derivação safe: `ASAAS_BASE_URL` (não-vazio pós-trim) sempre vence; senão `ASAAS_ENVIRONMENT==='production'` exato → prod, QUALQUER outro valor (ausente/vazio/typo) → sandbox. 8 casos em `config.test.ts` reexecutados sem cache pelo @qa (incl. typo→sandbox, API_KEY ausente→''). O default "nunca produção por omissão" agora vive em código DONE e testado. Só o `index.ts` faz a ponte `Deno.env.get`.

Contexto histórico: o client `_shared/asaas.ts` (Story 7.1) foi feito portável/injetável (`createAsaasClient({ baseUrl, apiKey, fetchImpl? })`) e não lia `Deno.env` — por isso o AC2 literal da 7.1 ficou sem dono DONE (CARRY-001 no gate `docs/qa/gates/7.1-asaas-client.yaml`). A 7.2 fechou isso.

**Why:** default de segurança financeira (mandar dinheiro real por engano se cair em produção por omissão).

**How to apply:** CARRY-001 não é mais pendência. O foco de segurança financeira migra para a 7.2: novos itens abertos no gate `docs/qa/gates/7.2-create-pix-payment.yaml` — **AUTHZ-001** (MEDIUM: Edge Function `create-pix-payment` sem verificação de ownership do pedido; com anon key pública qualquer chamador dispara cobrança/lê PIX — endereçar como AC da 7.5 antes do PIX real) e **IDEMP-001** (LOW: duplicata Asaas por falha parcial de persistência; dedup por `externalReference` na 7.5). Ver também [[project_signed_url_rls_admin]] (padrão de gap de autorização client-side). Relacionado: [[feedback_pnpm_qa_cache_mascara]] (o `pnpm qa` voltou FULL TURBO de novo nesta review; vitest reexecutado direto por pacote).
