# Plano de Merge + Adiantamento de Pagamentos (Asaas sem chave/sandbox)

> Criado em 2026-08-27. Cobre (A) o merge de tudo que está integrado até agora e
> (B) o que dá para construir do Épico 7 (pagamento Asaas) **antes** de ter a
> conta sandbox aprovada e os secrets setados. Fonte de verdade dos blqueios:
> `PENDENCIAS-CAIO.md` (ASAAS-1, ASAAS-2). Não inventa regra de negócio — as
> pendentes (Q1.8 reembolso parcial, PAY-01 taxa R$2,90) ficam marcadas.

---

## Parte A — Plano de merge

### Estado atual (2026-08-27)

| Item | Estado |
|---|---|
| Branch integrado | `feat/keepit-real-backend` (HEAD local à frente do PR em 2 commits) |
| PR aberto | **#2** `feat/keepit-real-backend` → `main` |
| Épicos integrados | 0–11, 102/109 stories Done (blocos 04–15 mergeados) |
| Branches de épico | 8 `feat/epic*` locais — **já mergeadas** (0 commits fora) |
| Branches órfãos auth | deletadas (story/2.5.1, 2.6, 2.7) |
| Remoto | só `main` e `feat/modo-demo-mock`; `feat/keepit-real-backend` pushed pelo @devops |

### Sequência de merge (ordem, dono)

1. **Push dos 2 commits locais** (`4dff2f7` docs/gitignore, `4b93980` versionCode) → atualiza o PR #2. — **@devops** (`git push`).
2. **Revisar PR #2** — CI local (`pnpm qa`) como gate (GitHub Actions bloqueado na conta, decisão registrada). — Caio.
3. **Merge PR #2 → `main`** com **merge commit** (preserva a história dos blocos; evita um squash de 24 commits num só). — **@devops** (`gh pr merge`).
4. **Pós-merge — limpeza de branches já integradas:**
   - Deletar locais: `feat/epic5-descoberta`, `feat/epic6-cart-checkout`, `feat/epic6-pedido`, `feat/epic6-retirada`, `feat/epic7-carteira`, `feat/epic8-admin-ops`, `feat/higiene-tipos-docs`, `feat/epic6-cancelamento`, `feat/epic11-admin-visual`, `feat/modo-demo-mock` (+ remoto `origin/feat/modo-demo-mock`).
   - Remover os worktrees `.worktrees/block-*` (`git worktree remove`) — já ignorados no git, mas ocupam disco.
   — **@devops**.
5. **Novo tronco:** `main` passa a ser a base. Trabalho novo (pagamento) sai de `main` em `feat/epic7-pagamento-asaas`.

### Regra de branching daqui pra frente

```
main
  └── feat/epic7-pagamento-asaas        (bloco de pagamento — Parte B)
        ├── (SDC por story: @sm draft → @po → @dev → @qa)
        └── merge no fim do bloco, com PR próprio
```

Um bloco = um branch = um PR. Sem worktrees paralelas divergindo de novo (a
lição dos blocos 04–15: 8 worktrees viraram dívida de reconciliação).

---

## Parte B — Adiantar pagamento Asaas SEM chave/sandbox

### Princípio-chave

A **chave Asaas e a aprovação do sandbox só importam em runtime** (fazer a
chamada HTTP real cair). Tudo que é **código, schema e teste** pode ser feito
agora — os testes rodam contra **fixtures gravadas** do shape documentado da API
Asaas (`docs/gateway/asaas.md`), com `fetch` injetado/mockado. Só o "ligar de
verdade" (E2E contra sandbox, deploy funcional das Edge Functions) espera
ASAAS-1 + ASAAS-2.

### O que JÁ está pronto (não refazer)

- **Carteira/financeiro (7.6–7.12):** view `carteira_lojista`, ledger
  `lancamentos_financeiros`, saque (RPC `solicitar_saque`), extrato, dashboard,
  cálculo da taxa Keepit — tudo em SQL/mock, Done.
- **Pedidos:** `forma_pagamento`, status `aguardando_pagamento` e
  `estornado_chargeback` já no enum; `OrderPort.confirmarPagamento(pedidoId)`
  existe (hoje disparado pelo `pagamentoSimulado` após ~5s). **É o ponto de
  plugue do webhook real.**
- **Falhas:** `estabelecimentos_falhas` já aceita `tipo='chargeback'`.

### O que dá para construir AGORA (offline) — por story

| Story | Entregável construível agora | Espera sandbox? |
|---|---|---|
| **7.1** Cliente HTTP Asaas | `apps/supabase/functions/_shared/asaas.ts`: `criarCliente`, `criarCobranca` (PIX), `estornarCobranca`, `criarTransferencia`, `tokenizarCartao`. Tipos de request/response do doc oficial. Lê `Deno.env.get('ASAAS_API_KEY')`/`ASAAS_BASE_URL` em runtime. Testes unitários com `fetch` mockado + fixtures. README de como testar cada método. | Só a **verificação real** contra sandbox (AC4) espera |
| **7.2** Cobrança PIX ao criar pedido | Edge Function `create-pix-payment`: recebe pedido → `asaas.criarCobranca` → persiste `asaas_payment_id`/`qr_code_pix`/`pix_copia_e_cola` → devolve QR/copia-e-cola. Migration que **adiciona essas 3 colunas** e **flipa o DEFAULT** de `aguardando_aceite` → `aguardando_pagamento` (modo supabase). Lógica + teste local (Deno test, DB/fetch mockados). | Deploy **funcional** e QR real esperam |
| **7.5** Webhook `PAYMENT_RECEIVED` | Edge Function `asaas-payment-webhook`: valida header `ASAAS_WEBHOOK_TOKEN`, idempotência por `asaas_payment_id`, em `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` acha pedido e faz `status → aguardando_aceite` + entrada `charge` no ledger. Testável 100% offline com payloads-fixture. | Entrega **real** do webhook espera |
| **7.11** Webhook `CHARGEBACK` | Mesma Edge Function trata `CHARGEBACK`/`PAYMENT_REFUNDED`: `status → estornado_chargeback`, registra `chargeback` no **ledger único** (reconcilia com `debitos_lojista` do épico — piloto usa 1 ledger, ver `project_backend_enxuto`), débito de R$40, e `estabelecimentos_falhas tipo='chargeback'`. Offline com fixture. | Evento real espera |
| **7.3 / 7.4** Cartão + tokenização | **DEFERIDO no plano vigente** (`epic 7` topo: "cartão, tokenização e chargeback ficam para depois; PIX + webhook são o core"). Os métodos `tokenizarCartao`/`criarCobranca` cartão ficam no client 7.1 como stubs testados, sem tela. | Fora do MVP-piloto |

### Arquitetura proposta (o "plugue trocável")

```
Cliente app ──► PaymentPort (novo em core-data)
                 ├── mock:      simula Asaas (evolui o pagamentoSimulado → auto-confirm via "webhook" fake)
                 └── supabase:  chama Edge Function create-pix-payment (retorna QR)

Asaas ──(webhook)──► Edge Function asaas-payment-webhook ──► RPC confirma pagamento (mesma transição do confirmarPagamento)
```

- **Introduzir `PaymentPort`** em `packages/core-data/src/ports/` + adapter mock
  + adapter supabase. Formaliza o que hoje é `pagamentoSimulado` avulso. Assim o
  app já chama `client.payment.criarCobrancaPix(pedido)` e a troca mock→real é
  flip de `DATA_SOURCE`, não reescrita.
- **`_shared/asaas.ts`** puro, sem dependência de segredo em import-time.
- **Fixtures** em `functions/_shared/__fixtures__/`: resposta de createPayment
  PIX (com `encodedImage`/`payload`), webhooks PAYMENT_RECEIVED/CONFIRMED/CHARGEBACK.
- **Migration** `..._pedidos_add_asaas_pix.sql`: 3 colunas + índice
  `idx_pedidos_asaas` + flip do DEFAULT no modo supabase.

### Ordem sugerida (SDC, dependências)

1. **7.1** client `_shared/asaas.ts` + fixtures + testes (base de tudo).
2. **Migration** colunas Asaas + `PaymentPort` (mock + supabase).
3. **7.2** Edge Function `create-pix-payment` + fiação do checkout (modo supabase).
4. **7.5** Edge Function `asaas-payment-webhook` (PAYMENT_RECEIVED) + RPC de confirmação.
5. **7.11** ramo CHARGEBACK no webhook + débito no ledger.
6. **Gate offline:** `pnpm qa` verde, todos os testes com fixtures passando.

### Checklist "ligar de verdade" (o que ASAAS-1/ASAAS-2 destravam)

- [ ] **ASAAS-1** — aprovar conta sandbox (`AWAITING_APPROVAL` → PIX disponível). — Caio/painel.
- [ ] **ASAAS-2** — setar `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`/`ASAAS_BASE_URL` nos secrets das Edge Functions do `keepit-dev`. — Caio (1 min).
- [ ] Deploy das 2 Edge Functions (via MCP) — @devops/@data-engineer.
- [ ] Registrar webhook via API (`POST /v3/webhooks`, `PAYMENT_RECEIVED`, com token).
- [ ] E2E sandbox: PIX gera QR → paga → webhook → pedido `aguardando_aceite` → PIN → carteira. (DoD do épico 7.)

### Bloqueios de regra de negócio (não código)

- **Q1.8** (stakeholder) — mecânica do **reembolso parcial** (6.18/6.19). Não
  bloqueia PIX/webhook 100%; bloqueia os casos parciais.
- **PAY-01** (stakeholder) — ratificar a **taxa R$2,90** ao comprador.
- **BR-HUB / subconta** — modelo-alvo (subconta por lojista, `walletId`,
  `pgsodium`) fica **pós-piloto**; piloto usa **conta Asaas única** (chave no env).
