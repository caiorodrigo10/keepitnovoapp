---
name: debito-validacao-device
description: Débito recorrente de validação empírica em device (sandbox sem simulador) — como calibrar o gate por tipo de risco
metadata:
  type: project
---

Nenhuma story do app Cliente foi validada em device/simulador — o sandbox não tem
iOS Simulator nem emulador Android. Débito registrado como `REQ-002` (gates 0.1/0.3/0.4)
e `TEST-001` (gate 2.1). Agrava-se porque `apps/cliente/package.json` tem
`"test": "echo skipped"` e `"lint": "echo skipped"` — o gate oficial `pnpm qa`
(o CI do GitHub está bloqueado a nível de conta) na prática só roda `tsc --noEmit`
para os apps RN.

**Why:** o ambiente de execução simplesmente não existe, não é desleixo do @dev.
O @dev (Dex) tem declarado a limitação explicitamente no Dev Agent Record em vez de
maquiar como "testado" — comportamento correto que deve continuar sendo tratado como
mérito, não como falha.

**How to apply:** calibrar a severidade pelo **tipo** do que ficou sem execução, não
pelo fato em si:
- não-validado = fidelidade visual/pixel (0.1/0.4) → `low`, o código roda de qualquer jeito;
- não-validado = comportamento de runtime que É o entregável, ou integração de módulo
  nativo novo (2.1: AsyncStorage) → `medium`, porque `tsc` não prova que linka nem que resolve.

Nunca dar PASS afirmando validação empírica que não houve. Quando o código entregue
ficar **dormente** (ex.: `AUTH_GUARD_ENABLED = false` deixa o `AuthStack` inalcançável
no boot, então a 2.1 só acorda na 2.6), a dívida não bloqueia a story atual — ancorar a
verificação empírica no DoD da story que ativa o código. Mitigação barata quase sempre
disponível: helpers puros (`lib/*.ts`) são testáveis com mock sem precisar de device —
falta runner configurado em `apps/cliente`.
