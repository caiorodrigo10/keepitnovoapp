# Keepit — Product Requirements Document (PRD)

Índice do PRD sharded (multi-arquivo). Produzido pelo agente **@pm (Morgan)** seguindo template AIOX v2.

## Estrutura

| Arquivo | Conteúdo |
|---|---|
| [01-overview.md](./01-overview.md) | Goals, Background Context, Success Metrics |
| [02-requirements.md](./02-requirements.md) | Requisitos funcionais (FR) e não-funcionais (NFR) |
| [03-ux-design.md](./03-ux-design.md) | UX vision, telas principais, branding, plataformas |
| [04-technical.md](./04-technical.md) | Technical assumptions (stack, repo, arquitetura, testes) |
| [05-epics.md](./05-epics.md) | Lista de épicos com goal statement + dependências |
| [06-next-steps.md](./06-next-steps.md) | Prompts para @architect e @sm |
| [epics/](./epics/) | Detalhamento de cada épico com stories numeradas |

## Contexto complementar

Este PRD **absorve e não substitui** os documentos que já existem:

- `ENTENDIMENTO_APP.md` — visão geral do produto (brief).
- `docs/ESCOPO_MVP.md` — escopo e princípios.
- `docs/PERGUNTAS_REGRAS_NEGOCIO.md` — 6 rodadas de decisões de negócio e técnicas.
- `docs/ARQUITETURA.md` — arquitetura técnica detalhada.
- `docs/gateway/asaas.md` — decisão sobre gateway de pagamento.
- `keepit-app/index.html` — protótipo visual (referência de fidelidade).

Quando o PRD parecer conflitar com esses documentos, **a fonte mais recente vence** — normalmente `PERGUNTAS_REGRAS_NEGOCIO.md → Decisões` (última rodada).

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-07-02 | 1.0 | Criação inicial do PRD | @pm (Morgan) |
| 2026-07-27 | 1.1 | Estratégia UI-first: novo Épico 0 (Casca Visual — todas as telas mock, fidelidade total, camada `packages/core-data`); Épico 1 reduzido/renomeado para "Fundação Backend & CI"; Épicos 2–9 mantêm número/goal mas passam a "plugar backend na tela existente". Ver `epics/0-casca-visual.md`. | @architect (Aria) + Caio |
