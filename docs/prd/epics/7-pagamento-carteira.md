# Épico 7 — Pagamento & Carteira

## Expanded Goal

Integrar o Asaas em produção-sandbox e implementar o **modelo financeiro completo**: cobrança PIX e cartão, tokenização de cartão, webhooks de pagamento e chargeback, carteira virtual do lojista (saldo disponível/bloqueado calculado por SQL), saque via PIX externo, e o dashboard financeiro do lojista.

Este épico depende do Épico 6 (pedidos existem) — a maioria das stories 6.x referencia "após pagamento confirmado", o que é resolvido aqui.

## Prerequisites

- Épico 6 concluído (pedido criado sem cobrança real).
- Conta Asaas sandbox com API key funcionando (`.env`).

## Stories

### Story 7.1 — Cliente HTTP Asaas + configuração sandbox

**As a** dev,
**I want** um wrapper HTTP tipado do Asaas para reuso em Edge Functions,
**so that** integração seja consistente.

**Acceptance Criteria:**
1: `apps/supabase/functions/_shared/asaas.ts` exporta client com métodos: `criarCliente`, `criarCobranca`, `estornarCobranca`, `criarSubconta`, `criarTransferencia`, `tokenizarCartao`.
2: Consome `ASAAS_API_KEY` e `ASAAS_ENVIRONMENT` de env.
3: Trata errors HTTP e retorna Result tipado.
4: README documenta como testar cada método contra sandbox.

---

### Story 7.2 — Criar cobrança PIX ao criar pedido

**As a** sistema,
**I want** gerar QR Code PIX na criação do pedido,
**so that** o cliente possa pagar imediatamente.

**Acceptance Criteria:**
1: Edge Function `criar-pedido` (do Épico 6) integrada com Asaas: após salvar pedido com status `aguardando_pagamento`, chama `criarCliente` (se não existir) + `criarCobranca` com billingType `PIX`.
2: Retorna QR Code (base64 + copia-e-cola) para o cliente.
3: Migration adiciona a `pedidos`: `asaas_payment_id`, `qr_code_pix`, `pix_copia_e_cola`.
4: Tela de pagamento PIX exibe QR Code + botão "Copiar código" (replica protótipo se houver, senão design system).

---

### Story 7.3 — Cobrança cartão com cartões salvos

**As a** cliente,
**I want** pagar com cartão salvo (ou novo),
**so that** o pagamento seja rápido.

**Acceptance Criteria:**
1: Tela de pagamento cartão replica protótipo (lista "Formas salvas" + botão "Adicionar cartão").
2: Cartões salvos vêm de `clientes_cartoes (id uuid, cliente_id, asaas_credit_card_token, ultimo4 text, brand text, criado_em)`.
3: Escolher cartão → Edge Function chama Asaas com `billingType = CREDIT_CARD` + token.
4: Suporta parcelamento até 3x sem juros no MVP (opções configuráveis em `packages/config/business-rules.ts`).

---

### Story 7.4 — Adicionar novo cartão com tokenização

**As a** cliente,
**I want** cadastrar um cartão novo no checkout,
**so that** eu use e opcionalmente salve para próxima compra.

**Acceptance Criteria:**
1: Tela replica protótipo (número, MM/AA, CVV, nome no cartão, checkbox "Salvar cartão").
2: Ao submeter, Edge Function `tokenizar-cartao` chama Asaas para tokenizar (sem PCI-DSS scope — token fica no Asaas).
3: Se "Salvar" marcado, salva `clientes_cartoes` com `asaas_credit_card_token`, últimos 4 dígitos e bandeira.
4: Usa token para criar cobrança no mesmo fluxo.

---

### Story 7.5 — Webhook `PAYMENT_RECEIVED`

**As a** sistema,
**I want** receber webhook do Asaas quando pagamento for confirmado,
**so that** o pedido avance para "aguardando aceite".

**Acceptance Criteria:**
1: Edge Function `webhook-asaas` valida assinatura do webhook (via `ASAAS_WEBHOOK_TOKEN`).
2: Se evento `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`: encontra pedido pelo `asaas_payment_id`, `UPDATE status = 'aguardando_aceite', pago_em = NOW()`.
3: Dispara push ao lojista (Story 6.8).
4: Se evento inesperado: retorna 200 e loga (sem estourar retry infinito).
5: Idempotente: se pedido já pago, ignora silenciosamente.

---

### Story 7.6 — Schema da carteira virtual do lojista

**As a** sistema,
**I want** uma view SQL calculando saldo do lojista,
**so that** todas as consultas de carteira sejam consistentes.

**Acceptance Criteria:**
1: Migration cria view `carteira_lojista` com colunas: `estabelecimento_id`, `saldo_disponivel_reais`, `saldo_bloqueado_reais`, `total_sacado_mes`.
2: `saldo_disponivel` = SUM de pedidos entregues há > 7 dias, - taxa Keepit 12%, - chargebacks R$ 40, - saques já feitos.
3: `saldo_bloqueado` = SUM de pedidos entregues há ≤ 7 dias, - taxa Keepit.
4: Constantes vêm de `packages/config/business-rules.ts` compiladas na migration (ou consultadas via função SQL).
5: Testes SQL verificam corretude.

---

### Story 7.7 — Lojista: tela "Carteira"

**As a** lojista,
**I want** ver meu saldo disponível e bloqueado,
**so that** eu saiba quanto posso sacar.

**Acceptance Criteria:**
1: Tela "Carteira" replica protótipo (número grande do saldo disponível, texto pequeno com bloqueado).
2: Botão "Solicitar saque" desabilitado se `saldo_disponivel < 200`. Se habilitado, leva à Story 7.8.
3: Seção "Saques recentes" exibe últimos saques com data e valor.

---

### Story 7.8 — Solicitar saque (mínimo R$ 200)

**As a** lojista,
**I want** solicitar saque do meu saldo disponível,
**so that** eu receba o dinheiro no meu banco.

**Acceptance Criteria:**
1: Tela "Solicitar saque" replica protótipo: input valor com validação (>= 200, <= saldo disponível), texto "Chave PIX: {chave}", botão "Confirmar saque".
2: Edge Function `solicitar-saque` valida saldo em tempo real (relê view), cria registro em `saques (id, estabelecimento_id, valor, status, asaas_transfer_id, solicitado_em)`, chama Asaas `criarTransferencia` (PIX externo) da conta master para a chave PIX do lojista.
3: Se Asaas retornar sucesso: `saques.status = 'processando'`. Se falhar: `status = 'erro'` com detalhe.
4: Webhook Asaas `TRANSFER_DONE` atualiza para `concluido` (Story 7.5 estendida).
5: Push ao lojista quando concluído: "Saque de R$ {X} recebido na sua conta!".

---

### Story 7.9 — Extrato simples

**As a** lojista,
**I want** ver histórico de vendas e saques,
**so that** eu tenha visão do meu financeiro.

**Acceptance Criteria:**
1: Tela "Extrato financeiro" replica protótipo (lista de MOVIMENTAÇÕES por data).
2: Fontes: pedidos entregues (crédito) + saques (débito) + chargebacks (débito).
3: Filtro por 7 / 30 / 90 dias.
4: Cabeçalho: "Total no período" e "Repasse líquido" (após taxas).
5: Query única em SQL com union all.

---

### Story 7.10 — Dashboard do lojista

**As a** lojista,
**I want** ver métricas de vendas no meu dashboard,
**so that** eu acompanhe meu desempenho.

**Acceptance Criteria:**
1: Tela "Painel do lojista" replica protótipo com cards: Vendas (7 / 30 / 90 / 1 ano), Saldo disponível, Ticket médio, Top produtos (top 5 por quantidade vendida no período).
2: Query eficiente (view materializada opcional se performance pedir; MVP começa com query direta).
3: Toggle de período no header.

---

### Story 7.11 — Webhook `CHARGEBACK`

**As a** sistema,
**I want** processar chargeback do Asaas,
**so that** o cliente seja estornado e o lojista arque com a taxa.

**Acceptance Criteria:**
1: Edge Function `webhook-asaas` trata evento `CHARGEBACK` (ou `PAYMENT_REFUNDED` se aplicável).
2: `UPDATE pedidos.status = 'estornado_chargeback'`, cria registro em `chargebacks (id, pedido_id, valor, criado_em)`.
3: Debita R$ 40 do saldo do lojista via inserção em `debitos_lojista (estabelecimento_id, valor, motivo, criado_em)` — reflete automaticamente na view `carteira_lojista`.
4: Push ao lojista: "Chargeback registrado no pedido #{numero}. Taxa de R$ 40 debitada do seu saldo."
5: Push ao cliente: "Seu chargeback foi processado."
6: Se saldo do lojista fica negativo, fica devedor até nova venda (sem cobrança externa no MVP).

---

### Story 7.12 — Cálculo da taxa Keepit

**As a** sistema,
**I want** aplicar 12% (placeholder) sobre o valor do produto ao entregar,
**so that** o lojista veja saldo com a taxa já deduzida.

**Acceptance Criteria:**
1: Em cada pedido, campo `taxa_keepit_reais` calculado como `subtotal_produtos * 0.12` (excluindo taxa de deslocamento).
2: `packages/config/business-rules.ts` exporta `TAXA_KEEPIT_PERCENTUAL = 0.12`. Se mudar, aplicações novas usam o novo valor; valores já calculados em pedidos passados permanecem históricos.
3: View `carteira_lojista` subtrai a taxa.
4: Testes unitários da fórmula.

---

## Definition of Done

- [ ] Todas as 12 stories `Done`.
- [ ] Um pedido de teste no sandbox: PIX gera QR, cliente paga, webhook chega, pedido avança, entrega confirmada por PIN, valor entra na carteira bloqueada, D+7 (simulado com update manual) muda para disponível, saque manual dispara transferência Asaas sandbox.
- [ ] Chargeback testado no sandbox — reflete débito de R$ 40 na carteira do lojista.
- [ ] Todas as regras financeiras cobertas por teste unitário.
