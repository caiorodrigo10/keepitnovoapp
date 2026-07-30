---
name: epic2-ac-traceability
description: ACs do Épico 2 (auth cliente) foram escritas de memória do protótipo, não de conferência — sempre validar contra frames do index.html
metadata:
  type: project
---

As ACs de `docs/prd/epics/2-auth-cliente.md` foram redigidas **de memória** do protótipo, não conferidas. Auditoria de 2026-07-30 achou erros em 2.1, 2.2, 2.8, 2.9 e 2.10.

**Why:** `keepit-app/index.html` contém frames de três apps no mesmo artboard (Cliente `01`–`14`, Lojista `P1`–`P11`, sem Admin). Uma string existir no arquivo não prova que ela pertence ao app certo — foi assim que "Passo 1 de 3" (frame P6, Lojista) virou AC do onboarding do Cliente.

**How to apply:** ao validar qualquer AC que afirme algo sobre UI/copy, localizar o offset da string no `index.html` e mapear para o frame. Mapa de offsets dos rótulos de frame (regex `letter-spacing:.04em;\">`): Cliente 01=272043 … 14=366977; Lojista P1=374607 … P11=453463. Tudo antes de 272043 é a **legenda do design system**, não copy de tela. PNGs em `docs/design-refs/` podem estar cortados — o `index.html` manda.

Telas do Cliente que **não existem** no protótipo (qualquer AC sobre elas é reconstrução): Configurações, Esqueci a senha (só o link no frame 10), confirmação SMS, modal de push, telas 1/3 e 2/3 do onboarding.

Relacionado: [[keepit-mvp-escopo]], pendências 10.2 (login social Google/Apple no protótipo vs fora do MVP) e 10.7 em `docs/PERGUNTAS_REGRAS_NEGOCIO.md`.
