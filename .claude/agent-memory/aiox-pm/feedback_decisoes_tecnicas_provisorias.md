---
name: decisoes-tecnicas-provisorias
description: Como fechar pendências no Keepit sem violar a regra de que o Caio não decide regra de negócio — formalizar default implícito como decisão técnica provisória, nunca como decisão do stakeholder
metadata:
  type: feedback
---

Quando o Caio pedir para "decidir por ele" uma pendência de `docs/PERGUNTAS_REGRAS_NEGOCIO.md`, **não fechar regra de negócio**. O caminho aceito é: formalizar como **decisão técnica provisória** aquilo que os épicos **já assumem implicitamente**, com (1) racional explícito, (2) custo de reversão, (3) **gatilho de revisão** e (4) um bloco destacado com **o que continua pendente do stakeholder**. Registrar em seção própria — `## Decisões técnicas provisórias` — **separada** de `## Decisões (fechadas)`, e marcar a pergunta com 🟠 (não ✅).

**Why:** o `CLAUDE.md` diz que o Caio não decide regra de negócio e que não se deve inventar default e seguir codando. Mas os épicos já operavam defaults **silenciosos** — o que é pior que um default auditável. A formalização não cria decisão nova: troca o default invisível por um documentado e reversível. O que **não** pode acontecer em hipótese alguma é uma decisão aparecer como "fechada pelo stakeholder".

**Como separar o que é seu do que é dele:** a escolha de *configuração/estrutura* (ex.: `Confirm email` OFF; `admin_users` sem coluna de papel) é técnica e você pode registrar. O *apetite a risco operacional* que ela implica (ex.: cliente com e-mail errado dependendo de WhatsApp para recuperar PIN de compra paga; quantas pessoas operam o painel e se precisa segregação de função) é do dono da Keepit — fica destacado como pendente, com ⚠️.

**Corolário:** se a pendência puder ser resolvida por **fidelidade ao protótipo** (princípio nº 1), ela **não é decisão de produto** — resolver e mandar para `## Decisões (fechadas)` com fonte = "fidelidade ao protótipo", sem envolver stakeholder. Foi o caso da 10.7. Ver [[design-refs-nao-sao-fonte-unica]] e [[project-sms-removal-doc-debt]].

**How to apply:** vale para qualquer pendência 🟡 que esteja bloqueando um épico já escrito. Antes de aplicar, confirmar que o épico **de fato já assume** aquele comportamento (grep nas ACs) — se não assumir, é decisão nova e aí sim para o stakeholder.
