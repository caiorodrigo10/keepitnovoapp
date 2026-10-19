---
name: feedback-sm-story-pattern-keepit
description: Formato/rigor esperado ao draftar stories neste projeto (Keepit), aprendido lendo Stories Done (4.1, 3.5) como precedente
metadata:
  type: feedback
---

Neste projeto, Stories `Done` recentes (ex.: `docs/stories/4.1.story.md`,
`docs/stories/3.5.story.md`) seguem um formato muito mais denso que o
template genérico AIOX (`story-tmpl.yaml`): além de Status/Story/AC/
CodeRabbit/Tasks/Dev Notes/Change Log, incluem seções extras já
consolidadas como padrão de fato — **MVP Pilot Classification**, **Data
Mode** (ambas exigidas por `docs/stories/README.md`), **Dependencies**
(com marcação 🟠/🔴 para pré-condições bloqueantes de infraestrutura vs.
decisões de arquitetura em aberto), **Complexidade**, **Scope** (Incluído/
Excluído explícitos) e **Executor Assignment** (executor/quality_gate/
quality_gate_tools/preferred_execution_model).

**Why:** o projeto está em MVP piloto com backend real sendo construído
incrementalmente sobre uma camada de UI 100% mock já pronta (Épico 0) — a
maior parte do trabalho de @dev em cada Story é "religar" UI existente a
dados reais, não desenhar UI nova. Sinalizar pré-condições de
@data-engineer/@architect como bloqueantes (sem prescrever a solução
técnica) evita que o @sm invente decisões de arquitetura, e evita que o
@dev comece a implementar sem a migration/RLS existir.

**Padrão de honestidade valorizado:** quando uma AC do épico não pode ser
cumprida honestamente (ex.: depende de uma tabela que ainda não existe,
tipo `pedidos` antes do Épico 6), a Story deve dizer isso explicitamente e
ajustar a AC para o que É verificável, em vez de inventar uma checagem
simulada ou silenciar a lacuna. Mesmo padrão para decisões de arquitetura
genuinamente não resolvidas na documentação (ex.: bucket produtos, `05-
security.md §6.7` só cita `hubs` como público) — apresentar opções, não
escolher pelo @architect.

**How to apply:** ao criar/expandir qualquer Story neste projeto, ler pelo
menos uma Story `Done` recente do mesmo domínio como precedente de formato
antes de escrever, e replicar a estrutura de seções (não só o template
genérico). Sempre verificar o estado REAL do código (ports/adapters/telas)
antes de escrever Dependencies — não presumir que "a UI já existe" ou "só
falta religar o adapter" sem ler o arquivo. Ver [[project_epic4_catalogo]].
