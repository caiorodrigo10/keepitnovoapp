# CLAUDE.md — Projeto Keepit

Instruções persistentes para o Claude Code neste projeto. Leia antes de agir.

## O que é o projeto

Estamos construindo o **MVP dos aplicativos da Keepit**: um marketplace hiperlocal *click-and-collect* onde o cliente compra de lojas próximas e retira tudo em um **Hub Keepit** com PIN de 4 dígitos.

Escopo do MVP:
- **App do Cliente** — nativo iOS + Android.
- **App do Lojista** — nativo iOS + Android.
- **Painel Admin** — web, uso interno dos donos da Keepit.
- Um único backend simples atendendo os três.

## Papéis no projeto

- **Usuário desta conversa (Caio)** — desenvolvedor do produto. É quem constrói. **Não decide regras de negócio.**
- **Stakeholder** — dono(s) da Keepit. Decide toda regra de negócio (taxas, prazos, política de reembolso, modelo do hub, etc.). Não está nesta conversa.
- **Claude (você)** — antes de assumir qualquer regra de negócio, **pergunte**. Se a resposta depende do stakeholder, registre a pergunta em `docs/PERGUNTAS_REGRAS_NEGOCIO.md` como pendente. **Nunca invente um default e siga codando.**

## Princípios de execução (importantes)

1. **Fidelidade ao protótipo**: a interface visual deve ser **exatamente** como em `keepit-app/index.html`. Não repropor UX.
2. **Backend simples e funcional**: deve funcionar bem, sem sofisticação. Nada de cache distribuído, filas, microserviços, sharding, feature flags complexos.
3. **Sem preocupação com escalabilidade agora**: MVP é MVP. Vertical simples serve.
4. **Nada além do necessário**: se não está no protótipo nem é regra de negócio essencial para operar (comprar → separar → retirar com PIN → repassar dinheiro), fica fora do MVP.
5. **Regras de negócio primeiro, código depois**: as decisões financeiras/operacionais em aberto em `docs/PERGUNTAS_REGRAS_NEGOCIO.md` **bloqueiam parte do desenvolvimento**. Não modelar pagamento antes de ter as respostas marcadas 🔴.

## Documentos de referência (leia antes de agir sobre o assunto)

- `ENTENDIMENTO_APP.md` — visão geral do produto, personas, telas, sistema de design, fluxos end-to-end. Extraído do protótipo.
- `docs/ESCOPO_MVP.md` — escopo acordado do MVP, princípios de execução, o que precisa ser decidido antes de codar.
- `docs/PERGUNTAS_REGRAS_NEGOCIO.md` — perguntas de regras de negócio pendentes, organizadas por tema (pagamento, pedido, hub, lojista, cliente, admin, legal). Prioridades 🔴🟡🟢. Registrar aqui toda decisão fechada, com data.
- `docs/ARQUITETURA.md` — arquitetura técnica do MVP: stack (Expo, Next.js, Supabase, monorepo), integração com Asaas (modelo carteira virtual), jornadas do cliente e do lojista, custos operacionais.
- `docs/gateway/asaas.md` e `docs/gateway/pagarme.md` — avaliação técnica dos gateways de pagamento com checklist de capacidades vs requisitos do MVP.
- `docs/prd/` — **Product Requirements Document (PRD)** completo em formato AIOX v2 sharded: `00-index.md`, `01-overview.md`, `02-requirements.md` (FR + NFR), `03-ux-design.md`, `04-technical.md`, `05-epics.md`, `06-next-steps.md`, e `epics/1-*.md` até `epics/9-*.md` com Stories detalhadas e Acceptance Criteria.
- `docs/architecture/` — **Architecture Document** focado em: `03-data-models.md` (schema Supabase completo, todas as tabelas, view `carteira_lojista`, jobs `pg_cron`) e `05-security.md` (RLS policies por tabela, gestão de segredos, criptografia PIN/PIX, prevenção OWASP básicos). Complementa `docs/ARQUITETURA.md` (visão macro).

## Materiais do protótipo

- `keepit-app/index.html` — protótipo bundled (461 KB, self-contained com assets em base64). É referência visual e de conteúdo, **não é código-fonte**. Foi provavelmente exportado de ferramenta tipo v0/Lovable.

## Modelos por agente

Regra fixa para o desenvolvimento do Keepit:

- **@dev (Dex)** — usar **Sonnet mais recente** (hoje `claude-sonnet-4-6`; alias `sonnet` no frontmatter do agente resolve automaticamente). Configurado em `.claude/agents/aiox-dev.md`.
- **@qa (Quinn)** — usar **Opus mais recente** (alvo Opus 4.8 quando disponível; alias `opus` no frontmatter resolve automaticamente para a versão mais recente). Configurado em `.claude/agents/aiox-qa.md`.

**Fluxo obrigatório em cada Story:**
1. Rodar `@dev` (Sonnet) para implementar a Story.
2. **Sempre** rodar `@qa` (Opus) em seguida para revisar, validar Acceptance Criteria e escrever gate PASS/CONCERNS/FAIL.
3. Só depois considerar a Story `Done`.

Nunca pular a etapa de QA — mesmo em Stories pequenas. A qualidade do MVP depende dessa revisão de segundo par de olhos.

## Como conduzir a conversa

- Quando o Caio trouxer uma dúvida técnica pura, responder direto.
- Quando envolver regra de negócio, checar se já está decidida em `docs/PERGUNTAS_REGRAS_NEGOCIO.md` seção `## Decisões`.
  - Se sim: seguir.
  - Se não: perguntar ao Caio. Se ele não souber, registrar como pendente do stakeholder e **não seguir codando essa parte**.
- Quando uma decisão for fechada nesta conversa, **atualizar** `docs/PERGUNTAS_REGRAS_NEGOCIO.md`:
  - Marcar a pergunta como resolvida (ou remover se ficou vazia).
  - Adicionar linha em `## Decisões` com data + tema + decisão + fonte (Caio ou Stakeholder).
