---
name: project-sms-removal-doc-debt
description: Decisão 10.4 (sem SMS/Zenvia no MVP) foi aplicada só no Épico 2; PRD, ARQUITETURA e apresentação ainda citam Zenvia
metadata:
  type: project
---

A decisão 10.4 (2026-07-29) removeu a confirmação por SMS via Zenvia do MVP do Cliente. Em 2026-07-30 ela foi aplicada em `docs/prd/epics/2-auth-cliente.md` (Stories 2.4 e 2.5 marcadas como removidas, sem renumerar as demais). **Outros documentos ainda não foram reconciliados** e continuam afirmando que existe SMS: `docs/prd/02-requirements.md` (FR2, NFR11, NFR18), `docs/prd/04-technical.md`, `docs/prd/03-ux-design.md`, `docs/prd/05-epics.md`, `docs/ARQUITETURA.md`, `docs/APRESENTACAO_STAKEHOLDER.md` (inclui a linha de custo Zenvia).

**Why:** a reconciliação foi deliberadamente escopada ao Épico 2 para manter o diff revisável; o resto ficou como dívida consciente, não esquecimento.

**How to apply:** antes de tratar qualquer um desses docs como fonte de verdade sobre auth, checar se a reconciliação já rolou (grep por "Zenvia"). Se ainda citar SMS, a decisão 10.4 prevalece. Verificar também se a lacuna [[project-email-confirm-open]] (item 10.5, confirmação de e-mail obrigatória ou não) já foi fechada — ela muda ACs de 2.3, 2.6 e 2.11.
