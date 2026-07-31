---
name: feedback-greps-nao-regressao
description: Greps de não-regressão em stories devem mirar o JSX/render, não o arquivo inteiro — senão proíbem documentar a própria remoção
metadata:
  type: feedback
---

Ao revisar (ou escrever) greps de não-regressão em stories deste projeto, exigir que o alvo seja o **que é renderizado**, não a ocorrência da string no arquivo inteiro.

**Why:** na Story 2.2 a Task 6 exigia que `grep "Google\|Apple\|OAuth\|SMS" CriarConta.tsx` retornasse vazio, enquanto a Task 4 mandava o JSDoc explicar a remoção do fluxo de SMS — instruções mutuamente impossíveis. O mesmo grep também acusou falso positivo por um comentário do Épico 0. Um comentário explicando *por que* algo não existe é documentação útil, não regressão.

**How to apply:** ACs do tipo "X não aparece na tela" se verificam por ausência de componente (`<Button>`/`<Pressable>`/texto no JSX), não por `grep` do arquivo. Se um grep amplo falhar só por comentário/JSDoc, isso é DOC/débito, nunca FAIL da AC. Ver também [[project-epico2-ac-traceability]].
