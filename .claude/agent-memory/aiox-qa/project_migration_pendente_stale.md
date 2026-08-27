---
name: migration-pendente-stale
description: nota "migration NÃO aplicada" do @dev vem stale no gate — worktrees têm .mcp.json vazio e @aiox-master aplica via MCP out-of-band
metadata:
  type: project
---

Em worktrees de bloco (ex.: `.worktrees/block-14-cancelamento`), o @dev trabalha
com `.mcp.json` vazio e sem `.env` real, então NÃO consegue aplicar migrations —
registra "Migration NÃO aplicada no keepit-dev" no Change Log e Dev Agent Record.
Quem aplica é o @aiox-master via MCP no projeto real `keepit-dev`
(id `jhhbewnmnorhmsdvfppo`), fora de banda, antes/durante o gate.

**Why:** o Dev Agent Record é imutável para o @qa (só posso editar QA Results),
mas a nota fica factualmente errada no momento do gate. Confirmado no Bloco 14
(stories 6.11/6.20/6.21): as 4 RPCs de cancelamento já existiam no banco no gate.

**How to apply:** no gate, NÃO tratar "migration pendente" como blocker por si só.
Confirmar o estado real (MCP supabase se disponível; senão, confiar na confirmação
explícita do @aiox-master + checar que `shared-types` bate com a assinatura da
migration) e CORRIGIR a nota na seção QA Results (não no Dev Agent Record). Ver
[[project_prova_empirica_adapters]] e [[project_migration_history_divergence]].
