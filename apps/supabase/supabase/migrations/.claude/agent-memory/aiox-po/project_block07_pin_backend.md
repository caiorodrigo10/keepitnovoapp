---
name: block07-pin-backend
description: Bloco 07 (retirada com PIN) — forma real do backend aplicado e a decisão de deferir o check-in do cliente
metadata:
  type: project
---

Bloco 07 (retirada com PIN) do Épico 6 — backend aplicado via MCP em 2026-08-13 (migrations `20260813022930/31/32`).

**Why:** o piloto simplifica o fluxo de encontro no hub; @data-engineer tomou decisões explícitas nos headers das migrations que divergem dos rascunhos originais do @sm.

**How to apply:** ao validar/criar stories deste fluxo, tratar como verdade:
- `avancar_estado_pedido(p_pedido_id uuid, p_novo_status text)` RETURNS text: cobre `aceito→em_preparo`, `aceito/em_preparo→saindo_hub` (grava `saiu_hub_em`), `saindo_hub→no_hub`. NUNCA produz `entregue` nem cancela. Erro de origem/alvo = `TRANSICAO_INVALIDA` (não `ESTADO_INVALIDO`).
- `confirmar_pin_pedido(p_pedido_id uuid, p_pin text)` RETURNS TABLE `(resultado, tentativas_restantes, bloqueado_ate)`: desfechos do PIN (`entregue`/`pin_incorreto`/`pin_bloqueado`) vêm por RETURN, não RAISE (senão o ROLLBACK apagaria o incremento de `tentativas_pin` e o lockout 5/5min nunca dispara). Só condições estruturais são exceção. Entrada válida = `no_hub`. Nunca expõe `pin_hash`.
- **Só `saiu_hub_em` foi adicionada.** `cliente_chegou_em`/`lojista_chegou_em` ficaram LATER (piloto = 1 check-in do lojista, sem check-in bilateral). Não existe RPC de check-in do cliente; `markClienteChegou` no adapter Supabase segue `NotImplementedError`.

A Story 6.14 foi NO-GO na v0.1 (desenhada sobre 2 colunas + 2 RPCs que o backend deliberadamente não implementou). O @sm re-desenhou (v0.2) e o @po deu **GO (9/10) na re-validação 2026-08-13 → Status Ready**: agora implementa SÓ `markArrivedAtHub` (lojista) chamando `avancar_estado_pedido(pedidoId,'no_hub')`, sem coluna/RPC nova. Débito conhecido: a tela `apps/cliente/.../ChegueiAoHub.tsx` tem um botão que chama `markClienteChegou` → `NotImplementedError` (sempre falha em modo real). Decisão de escopo do @po: NÃO tratar na 6.14 porque a tela é **órfã** (sem `navigate('ChegueiAoHub')` vivo no app do cliente — só um comentário em `LojistaNaoVeio.tsx` sinalizando CTA futuro); registrado como GUARD bloqueante-antes-de-ligar-o-CTA. Ver [[block07-story-validation]] para o veredito por story.
