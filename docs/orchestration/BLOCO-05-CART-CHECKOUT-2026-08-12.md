# Bloco 05 — Carrinho + Checkout (pré-pagamento) — Épico 6 (6.1–6.5)

**Orquestrador:** `@aiox-master` via Claude Code.
**Data:** 2026-08-12
**Worktree:** `.worktrees/block-05-cart` · branch `feat/epic6-cart-checkout` · base `feat/epic5-descoberta` (49a8320, blocos 01–04).
**Modo:** execução contínua no worktree; fluxo AIOX `@sm → @po → @dev → @qa` por story. **Sem migration nova** (cálculo client-side + leituras já reais + update de `clientes.cpf` já existente).

## Objetivo

Levar o cliente de **carrinho → checkout → pronto para pagar**, parando EXATAMENTE na fronteira do pagamento. Tudo que vem depois (gerar PIN, criar pedido, cobrar PIX) exige as regras de negócio Q2.1/2.2/2.3 (pendentes do Caio) e fica para o próximo bloco.

## Escopo — 6.1 a 6.5

| Story | Classe | O que | Backend |
|---|---|---|---|
| 6.1 | CORE | Carrinho de uma loja (add/remover/qtd; regra "um carrinho por loja"; alerta+limpa ao trocar de loja) | **client-side** (CartContext + AsyncStorage) — decisão técnica do piloto (backend simples; sem cross-device; mock já é client-side). Sem migration `carrinho`. |
| 6.2 | CORE | Resumo do checkout: Subtotal + Taxa de deslocamento (`estabelecimentos.taxa_deslocamento_reais`) + Taxa de serviço + Total | leituras. Keepit 10% **NÃO exibida** (embutida, deduzida do lojista — Rodada 8). Taxa comprador **R$2,90 provisória** (config `businessConfig`, pende ratificação stakeholder — flag). |
| 6.3 | SIMPLE | Validação temporal síncrona: `agora + tempo_medio + 10min <= fechamento do hub hoje` | leitura de `hubs_horarios` + `estabelecimentos.tempo_medio_entrega_min`; síncrona no checkout (sem Edge Function — overlay piloto). |
| 6.4 | SIMPLE | Validação ticket mínimo: `COALESCE(estabelecimento.ticket_minimo_reais, 20.00)`; desabilita "Pagar" se abaixo | `packages/config/business-rules.ts`. |
| 6.5 | CORE | CPF no primeiro checkout: se `clientes.cpf IS NULL`, exigir; validar formato+DV; salvar em `clientes.cpf` | update do próprio (RLS `cliente_atualiza_proprio` já existe). Método "set CPF once" no port. |

**Fronteira:** o botão "Pagar" chega até a validação; **não cria pedido, não gera PIN, não cobra**. Isso é 6.6+ (bloqueado por Q2.1/2.2/2.3).

## Fluxo por story

`@sm` Draft → `@po` valida/Ready → `@dev` implementa no worktree → `pnpm qa` + typechecks → `@qa` gate. `DATA_SOURCE=mock` continua default; leituras reais só com `DATA_SOURCE=supabase`. Sem push. Sem sucesso fictício; validações reais.

## Depende do Caio (para o final)

1. **Ratificar a taxa de serviço ao comprador R$2,90** (provisória, exibida em 6.2). É valor de config (mudança de 1 linha); só precisa do OK do stakeholder. Até lá, exibida com a flag "provisória".
2. **Q2.1 / Q2.2 / Q2.3** (ciclo do pedido, PIN, cancelamento) → destravam **6.6+** (criar pedido, PIN, pagamento) — próximo bloco, FORA deste.
3. Nada mais deste bloco depende de você.
