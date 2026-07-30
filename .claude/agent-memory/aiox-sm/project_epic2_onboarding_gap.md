---
name: project-epic2-onboarding-gap
description: Story 2.1 (Épico 2, onboarding do Cliente) só cobre a persistência da flag "visto uma vez" — as 3 telas já existem desde o Épico 0
metadata:
  type: project
---

Épico 2 (Auth & Onboarding do Cliente) começou a ser draftado em 2026-07-30. A Story 2.1 do épico ("Onboarding Como funciona, 3 telas") **não parte do zero**: o Épico 0 (casca visual, UI-first — ver [[project_epic0_uifirst]]) já entregou as 3 telas via Story 0.4 (`docs/stories/0.4.story.md`), incluindo pager indicator, textos e navegação (Avançar/Pular/Criar conta/Entrar).

Investigação confirmou por leitura de código (`apps/cliente/src/navigation/AuthStack.tsx`, `apps/cliente/src/screens/auth/Onboarding{1,2,3}.tsx`) que faltava apenas o AC4 do épico: persistir a flag "onboarding só aparece uma vez" (nenhuma lib de storage local — `AsyncStorage`/`SecureStore` — estava instalada em nenhum app do monorepo) + botão de reset em dev. A Story `docs/stories/2.1.story.md` foi escrita com escopo restrito a esse gap, com AC1-3 marcados como já satisfeitos (riscados, sem tasks) para não duplicar trabalho.

**Why:** este é o mesmo padrão que vai se repetir em outras stories dos Épicos 2-9 — como o Épico 0 já construiu a casca visual completa, cada story desses épicos tende a ser um "delta" (backend, persistência, regra de negócio) sobre uma tela que já existe, não uma tela nova.

**How to apply:** antes de draftar qualquer story dos Épicos 2+, investigar primeiro o que a story equivalente do Épico 0 já entregou (procurar pelo nome do app/tela em `docs/stories/0.*.story.md` e no código de `apps/*/src`) antes de assumir que a story precisa construir UI. Ver também [[project_epic1_backend]] para o estado do backend/Supabase que essas stories vão consumir.
