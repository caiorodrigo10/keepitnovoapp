---
name: project-bloco09-admin-ops
description: QA gate outcome do Bloco 09 (Épico 8, stories 8.1–8.9) e flags de regra de negócio abertos para o stakeholder
metadata:
  type: project
---

Bloco 09 (Operação Admin, Épico 8) — QA gate rodado por @qa em 2026-08-13, worktree `.worktrees/block-09-admin-ops` (branch `feat/epic8-admin-ops`). Todas as 9 stories → **Done**: 8.1–8.7 e 8.9 **PASS**, 8.8 **CONCERNS** (sem critical/high). Evidência real: `pnpm qa` 27/27; core-data **475/475** (fresh, sem cache); admin typecheck limpo. 6 migrations `2026081307000*` conferidas — todas hardened (SECURITY DEFINER + search_path='' + is_admin() + REVOKE/GRANT), advisors só WARN 0028/0029 intencionais.

**Financeiro do piloto = manual auditável SEM Asaas** (RPC `confirmar_lancamento_admin`, compartilhada refund+payout, só grava status/ator/concluido_em). Cancelamento forçado (8.4) = refund 100% atômico; bloqueia TODOS estados terminais (anti double-refund, melhoria sobre a instrução literal). `criar_pedido` reaplicada rejeita `CLIENTE_BLOQUEADO` preservando SEC-006.

**Why:** fila autônoma noturna; regra de negócio toda decidida (Rodada 2 + admin-lista-plana 10.6), nada inventado.
**How to apply:** dois flags de regra de negócio ficaram abertos para o stakeholder (Caio não decide) — levantar quando o piloto amadurecer:
1. **8.8** `estabelecimentos_falhas` é **admin-only** (lojista NÃO vê as próprias falhas — segue `05-security.md §3.6`, não a sugestão da missão). Se o stakeholder quiser expor ao lojista, precisa policy `FOR SELECT USING estabelecimento_id = meu_estabelecimento_id()`.
2. **8.7** `taxaSucessoPercent` do dashboard usa denominador = entregues+cancelados+no-show (exclui pedidos em curso). Confirmar a base de cálculo desejada.

Débitos LATER pré-aprovados @po (não rebaixaram gate): filtros/paginação (8.3), busca CPF/e-mail (8.5), ranking hubs + Recharts (8.7), tempo médio real (8.8), Asaas real → Bloco 08-PIX, push → polling, verificação manual em browser. Relacionado: [[project-bloco01-auth]].
