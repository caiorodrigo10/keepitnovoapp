---
name: project-sms-removal-doc-debt
description: Decisão 10.4 (sem SMS/Zenvia no MVP) já reconciliada em todo o PRD e na ARQUITETURA; resta o Architecture Document (03-data-models, 05-security) e o código do app
metadata:
  type: project
---

A decisão 10.4 (2026-07-29) removeu a confirmação por SMS via Zenvia do MVP, para **Cliente, Lojista e Admin** (os três usam e-mail + senha).

**Já reconciliado (2026-07-30):** `docs/prd/epics/2-auth-cliente.md` (Stories 2.4 e 2.5 removidas, sem renumerar), `docs/prd/epics/3-lojista-aprovacao.md` (nenhuma story removida — só ACs), `docs/prd/epics/0-casca-visual.md`, `docs/prd/epics/9-publicacao-compliance.md`, `docs/prd/02-requirements.md` (FR2 removido), `03-ux-design.md`, `04-technical.md`, `05-epics.md`, `docs/ARQUITETURA.md`, `docs/APRESENTACAO_STAKEHOLDER.md`, `docs/prd/06-next-steps.md` (Zenvia fora do diagrama de contexto) e `docs/EPICO_0_RECONCILIACAO.md` (10.4 marcada resolvida; dívida do `auth.port` reescrita como pendência de implementação das Stories 2.3/2.6).

**Dívida remanescente (ainda afirma que existe SMS):** `docs/architecture/03-data-models.md` (coluna `telefone_confirmado` + tabela de códigos SMS), `docs/architecture/05-security.md` (`ZENVIA_API_TOKEN`, rate limit de SMS, item de checklist), e o código (`apps/cliente/.../ConfirmacaoSMS.tsx` + rota no `AuthStack`, `packages/core-data/src/ports/auth.port.ts` e mocks).

**Why:** a reconciliação foi feita em rodadas escopadas por arquivo para manter os diffs revisáveis e permitir agentes em paralelo — o que sobrou é dívida consciente, não esquecimento.

**How to apply:** antes de tratar um desses docs como fonte de verdade sobre auth, grep por "Zenvia"/"SMS". Se ainda citar SMS, a decisão 10.4 prevalece. Checar também as duas lacunas abertas que nasceram dessa reconciliação: **10.5** (confirmação de e-mail obrigatória — vale para os 3 perfis, muda ACs 2.3/2.6/2.11 e 3.2/3.6/3.7) e **10.6** (papéis internos de admin e provisionamento de `admin_users` — muda a Story 3.7). Uma terceira lacuna, **10.7** (explicar o PIN no onboarding do Cliente), nasceu de outra frente — ver [[design-refs-nao-sao-fonte-unica]].

**Nuance que já foi decidida e não deve ser reaberta:** o telefone é opcional só para o **Cliente**. Para o **Lojista** continua **obrigatório** (Rodada 2 o exige no onboarding; Rodada 5 o usa como WhatsApp de contato) — a 10.4 só o tornou *não verificado*.
