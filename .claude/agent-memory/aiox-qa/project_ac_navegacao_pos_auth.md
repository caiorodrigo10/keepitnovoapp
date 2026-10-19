---
name: ac-navegacao-pos-auth
description: ACs de "sucesso navega para a home" não podem ser dadas como cumpridas até o guard de sessão real da Story 2.6 — a rota Main é inalcançável a partir da AuthStack
metadata:
  type: project
---

Qualquer AC do tipo "após sucesso, navega para a home" nos apps RN está **não verificável** até a Story 2.6 substituir o guard stub por sessão real. Provado no gate da 2.3: o `RootNavigator` do cliente monta `Auth` e `Main` de forma mutuamente exclusiva, então `getParent()?.navigate('Main', …)` a partir de uma tela da AuthStack é uma ação não tratada — não navega, não erra, não dá feedback. Mesmo padrão inerte em `CriarConta`, `Login` e `ConfirmacaoSMS` (herdado do Épico 0).

**Why:** no gate da 2.3 o @dev reportou que a navegação "funciona" por causa do `AUTH_GUARD_ENABLED = false`; na verdade não funciona em configuração nenhuma, e a falha é silenciosa — o tipo mais caro de passar batido.

**How to apply:** em gates de 2.6, 2.11 e qualquer story com AC de transição pós-auth, exigir prova de que o navigator **re-renderiza** por mudança de estado de sessão, não apenas que existe uma chamada `navigate`. Ver também [[project_debito_validacao_device]] — sem simulador, isso não é testável em runtime aqui, então a prova é estrutural.
