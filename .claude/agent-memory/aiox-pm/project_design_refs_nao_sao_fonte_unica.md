---
name: design-refs-nao-sao-fonte-unica
description: As PNGs em docs/design-refs/ são recortes com cropping — a fonte de verdade da copy é keepit-app/index.html; grepar o HTML antes de declarar algo "inventado"
metadata:
  type: project
---

As capturas em `docs/design-refs/*.png` são recortes de um screenshot full-page do protótipo e **podem estar cortadas**. Elas são a referência de *layout*, mas **não** são a fonte de verdade da **copy**. A fonte de verdade textual é `keepit-app/index.html` (é HTML, então dá para grepar a string exata).

**Why:** em 2026-07-30, a validação da Story 2.1 concluiu que a frase *"Retira com código PIN no ponto"* era invenção do autor do épico, porque em `_design-system-legend.png` o card 2 aparece truncado e o card 3 nem aparece. Grepando o `index.html`, as três frases estão lá **literalmente** — o que estava errado era só o *contexto* atribuído a elas (bloco "COMO FUNCIONA" da legenda do design system, não copy de tela). Concluir "invenção" a partir do PNG teria produzido uma correção errada.

**How to apply:** ao aplicar Article IV (No Invention) sobre qualquer AC que cite texto de tela, grepar `keepit-app/index.html` **antes** de declarar a copy inventada. Duas armadilhas já confirmadas nesse arquivo: (1) o protótipo tem **uma única** tela de onboarding do Cliente (frame "01 · Onboarding") — qualquer AC que fale em 3 telas está descrevendo reconstrução, não protótipo; (2) rótulos como *"Passo 1 de 3"* e *"Continuar"* existem no HTML mas pertencem ao **Cadastro do estabelecimento do Lojista (frame P6)** — a mera presença da string não prova que ela é daquela tela. Distinguir sempre "a string existe" de "a string é desta tela". Relacionado: [[project-sms-removal-doc-debt]].
