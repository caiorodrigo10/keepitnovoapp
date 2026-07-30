---
name: nao-citar-fonte-falsa-em-ac
description: Nunca citar keepit-app/index.html ou design-refs como fonte de uma AC sem ter localizado o offset — AC com fonte falsa é pior que AC sem fonte
metadata:
  type: feedback
---

Ao escrever uma AC, só citar `keepit-app/index.html` / `docs/design-refs/*.png` como fonte depois de **localizar o offset exato** da evidência no frame certo. Quando o elemento vem do Épico 0 e não do protótipo, marcar como 🔵 **reconstrução do Épico 0** e declarar explicitamente *"sem fonte no protótipo; a referência é o código do Épico 0"*.

**Why:** em 2026-07-30 a AC1 da Story 2.1 exigia "indicador de progresso por **dots**" citando `cliente-01-onboarding.png` + frame 01 como fonte. O frame 01 (faixa 272043–276953) **não tem pager de dots** — os únicos círculos são o ícone verde de 128px (274274) e dois marcadores de 6px dentro das pílulas "Farmácia"/"Conveniência" (275004, 275363). O `Dots` veio do Épico 0. O @po classificou como **mais grave** que o erro original: uma AC **sem** fonte deixa o leitor cético e ele confere; uma AC que **cita fonte específica** desliga o ceticismo do @dev e do @qa, e a invenção entra no código com carimbo de verificada.

**How to apply:** vale para toda AC de fidelidade visual. Um pager/indicador de passo só faz sentido onde há mais de uma tela — e o protótipo tem **uma única** tela de onboarding do Cliente; então qualquer indicador de progresso ali é necessariamente reconstrução. Mesma lógica para o campo `Telefone` (0 ocorrências no arquivo) e para a tela "Configurações do Cliente" (só existe no frame P11 do **Lojista**): "replica o protótipo" **não pode** cobrir elemento que não está lá — a origem correta é FR/decisão, e o desvio precisa estar escrito. Ver [[design-refs-nao-sao-fonte-unica]] para o mapa de offsets e [[decisoes-tecnicas-provisorias]] para o padrão de registrar pendência sem inventar default.
