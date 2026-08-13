---
name: block08-carteira-state
description: Bloco 08 carteira/ledger — estado real do banco, Model B do ledger, e pendência SEC-006 da 7.12
metadata:
  type: project
---

# Bloco 08 — Carteira/Ledger (Stories 7.6–7.12)

Validadas por @po em 2026-08-13, todas Draft → Ready (7.6=9, 7.7=9, 7.8=8, 7.9=9, 7.10=9, 7.12=7).

**Estado real do banco (aplicado via MCP antes da validação):**
- `lancamentos_financeiros` (ledger append-only, RLS+FORCE, trigger imutabilidade) + view `carteira_lojista` (`security_invoker`) JÁ APLICADOS.
- RPC `solicitar_saque(p_valor_centavos)` JÁ APLICADA. Erros reais: `AUTENTICACAO_NECESSARIA`, `ESTABELECIMENTO_NAO_ENCONTRADO`, `VALOR_MINIMO_SAQUE` (20000 centavos), `SALDO_INSUFICIENTE`. O rascunho da 7.8 citava `p_valor_reais`/`ACESSO_NEGADO`/`VALOR_ABAIXO_DO_MINIMO` — NÃO existem; corrigido.
- `criar_pedido` já lança `charge`(+total)/`platform_fee`(−taxa); `confirmar_pin_pedido` já lança `merchant_credit` líquido D+7.

**Model B (decisão registrada):** o ledger usa Model B — `merchant_credit` carrega o LÍQUIDO (`subtotal − taxa_keepit + deslocamento`); `charge`/`platform_fee` são auditoria e NÃO entram na carteira. Diverge do §6.2 de `03-data-models.md` (Model A: bruto + platform_fee na carteira), mas **output idêntico**. Model B aceito; recomendado atualizar §6.2 como doc (não bloqueia).
**Why:** É o que está aplicado e é mais simples de auditar (1 pedido = 1 crédito líquido).
**How to apply:** Ao validar/QA de stories da carteira, esperar que a view só some `merchant_credit`+`payout`; testes que somem `platform_fee` no saldo estão errados vs. o aplicado.

**Pendência SEC-006 (Story 7.12):** a fiação do ledger está aplicada, mas o recálculo server-side de `taxa_keepit_reais` NÃO — `criar_pedido` em produção ainda confia no `p_taxa_keepit_reais` do client. 7.12 exige migration ADICIONAL de `criar_pedido` (recalcular `ROUND(subtotal*10/100,2)`, ignorar param) = trabalho real/pré-condição @data-engineer. Só com ela SEC-006 fecha.

**Fronteira Asaas:** PIX real (Asaas) FORA do piloto (7.1/7.2/7.5, Bloco 09). Saque = solicitação `payout` PENDENTE; Admin executa PIX manual (Épico 8/Story 8.2). Nenhuma story simula transferência real. Taxa Keepit 10% não exibida ao cliente; carteira mostra líquido. Ver [[block07-pin-backend]].
