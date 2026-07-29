# Épico 0 — Backlog de Reconciliação (antes do Épico 1)

Consolidação dos follow-ups levantados pelos gates de QA das Stories 0.1–0.13. **Nenhum é bloqueante do Épico 0** (todas as stories estão `Done` com gate CONCERNS), mas os itens ARCH/config devem ser resolvidos **antes de o Épico 1 plugar o backend real**, senão a fronteira mock→Supabase quebra.

Status em 2026-07-28.

## ✅ Já reconciliado nesta rodada
- **`pnpm install` real** executado — deps de workspace (`@keepit/core-data`, `@keepit/config`, react-navigation) agora no `pnpm-lock.yaml`; os symlinks manuais criados pelos @dev durante a paralelização não são mais necessários. `pnpm turbo run typecheck` = 9/9.
- **Onboarding do Cliente → dark** (REQ-004) — corrigido para fidelidade à referência `cliente-01-onboarding.png`.
- **Hex `#1B1E1C` hardcoded** (MNT-001 das 0.8/0.10) — varridos; grep limpo em `apps/lojista/src/**` e `apps/cliente/src/**`.
- **[2026-07-29 — Story 1.10] ARCH — ports estendidas**: todos os gaps da seção "🔴 ARCH — estender ports" abaixo foram promovidos para `packages/core-data` (`order.port`, `auth.port`, `admin.port`, `product.port`, `store.port`, novo `analytics.port.ts`). Os 8 arquivos de mock/context local (`apps/admin/src/mock/adminOps*.ts`, `apps/admin/src/mock/asyncOpsHelpers.ts`, `apps/lojista/src/screens/pedidos/lojistaOrders.mock.ts`, `apps/lojista/src/screens/financeiro/financeiro.mock.ts`, `apps/cliente/src/context/OrderStatusOverrideContext.tsx`) foram removidos; os hooks/contexts dos 3 apps religados para `getDataClient()`. `CartContext.tsx` (carrinho/cartão do Cliente) permanece local-only por decisão FINAL (não mais pendência), documentada no próprio arquivo. Ver `docs/stories/1.10.story.md`.
- **[2026-07-29 — Story 1.10] Config — matriz de cancelamento completa**: `businessConfig` ganhou as 6 chaves de percentuais de reembolso (Rodada 2); `apps/cliente/src/lib/cancelamentoPolicy.ts` não hard-coda mais os valores.

## 🔴 ARCH — estender ports de `packages/core-data` (obrigatório antes do Épico 1)

_Resolvido pela Story 1.10 (2026-07-29) — ver entrada correspondente em "✅ Já reconciliado nesta rodada". Tabela mantida como referência histórica dos gaps originais._

| Origem | Gap | Onde vivia (local, removido) |
|--------|-----|------------------------|
| 0.13 (admin) | admin-ops: list-all clientes/lojistas/pedidos, `forceCancelOrder`, `refundQueue` populada, `blockCliente`, `suspendLojista`, `financialDashboard`, `lojistaQualityView` | `apps/admin/src/mock/adminOps*.ts` |
| 0.10 (lojista) | order lado-lojista: `listByEstabelecimento`, `markReadyForHub`, `markArrivedAtHub`, `markCustomerNoShow`, `AuthPort.getById` | `apps/lojista/src/screens/pedidos/lojistaOrders.mock.ts` |
| 0.7 (cliente) | order lado-cliente: `getById`, estados `em_preparo/saindo_hub/no_hub/cliente_chegou_em` | `apps/cliente/src/context/OrderStatusOverrideContext.tsx` |
| 0.9 (lojista) | `ProductPort` sem `delete()`/`ativo` no update/`list()` inativos; `StorePort` sem escrita (`setPausadoManualmente`) | contexts em `apps/lojista/src/screens/catalogo/` |
| 0.11 (lojista) | vendas/top-produtos/extrato (agregações) — não modelados em `wallet.port` (candidato a `analytics.port.ts`, derivar de `pedidos`) | `apps/lojista/src/screens/financeiro/financeiro.mock.ts` |
| 0.6 (cliente) | port de carrinho/cartão salvo | `apps/cliente/src/context/CartContext.tsx` (decisão FINAL: manter local) |

## 🔴 Config — valores de regra ainda fora de `@keepit/config`

_Resolvido pela Story 1.10 (2026-07-29) — ver entrada correspondente em "✅ Já reconciliado nesta rodada"._

- ~~**Percentuais de reembolso** (100/90/10/80/20 — matriz da Rodada 2) centralizados hoje em `apps/cliente/src/lib/cancelamentoPolicy.ts`. Migrar para `businessConfig`.~~

## 🟡 Stakeholder (ver `PERGUNTAS_REGRAS_NEGOCIO.md` seção 10)
- 10.1 Mapa na tela de escolha do ponto de retirada (protótipo tem; decisão dizia "sem mapa").
- 10.2 Login social Google/Apple (protótipo tem; decisão = fora do MVP).
- 10.4 🔴 Modelo de auth do Cliente: telefone/SMS vs e-mail/senha — bloqueia auth real do Épico 1; o tipo `Cliente`/`auth.port` só modelam nome+telefone.

## 🟡 Infra / testes
- **Test runner nos apps** — `apps/{cliente,lojista,admin}` têm `test = echo skipped`; nenhuma cobertura automatizada de UI/mock local (só `packages/core-data`/`config` têm Vitest). Story de infra para adicionar runner (TEST-001 recorrente).
- **ESLint real** — `lint = echo skipped` em todos os workspaces desde a 0.1 (MNT recorrente).
- **CodeRabbit** — indisponível no sandbox (sem WSL); rodar no ambiente do @devops antes do push.

## 🟡 Validação visual em device (REQ-002 — recorrente em todas as stories)
O sandbox não tem simulador iOS/emulador Android. A fidelidade foi verificada por **comparação de código contra as imagens de `docs/design-refs/`** e, no Admin (web), por render real via `next dev`+Playwright. **Antes de fechar o Épico 0 para produção**, rodar Cliente e Lojista em simulador/emulador reais e conferir as telas contra `docs/design-refs/`.
