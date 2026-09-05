# Task 3 fix report — CTA demo one-shot

Data: 2026-09-05
Finding corrigido: `task-3-review.md` — 1 MEDIUM
Commit original revisado: `05e709d feat(cliente): expose demonstrable password recovery`

## Resultado

- A abertura do callback demo agora usa uma ação one-shot que adquire a trava
  antes de sinalizar loading e antes de chamar `Linking.openURL`.
- Chamadas duplicadas são ignoradas tanto enquanto a primeira abertura está
  pendente quanto depois que o sistema operacional confirma a abertura. A
  trava não é reaberta, porque o callback representado pelo CTA é de uso único.
- O CTA recebe `loading` e `disabled` desde o primeiro acionamento. Mesmo antes
  do rerender, a guarda síncrona impede uma segunda abertura.
- Falha de `Linking.openURL` preserva a navegação genérica para
  `recovery=invalid`; nenhuma URL, token ou detalhe técnico é propagado para a
  navegação ou incluído em logs.
- A regressão é uma unidade pura, sem renderer e sem ampliar a matriz de testes.

## Evidência TDD

### RED

```text
pnpm --filter @keepit/cliente test -- src/lib/passwordRecoveryPresentation.test.ts

Test Files  1 failed (1)
Tests       2 failed | 5 passed (7)
Falha       createPasswordRecoveryDemoCallbackAction is not a function
Exit 1
```

Os dois novos casos falharam pela ausência da guarda: abertura duplicada e
ordem `loading` antes de `openURL`.

### GREEN focado

```text
pnpm --filter @keepit/cliente test -- src/lib/passwordRecoveryPresentation.test.ts

Test Files  1 passed (1)
Tests       7 passed (7)
Exit 0
```

O caso de replay comprova uma única abertura durante a pendência e depois da
resolução de `openURL`.

## Gate final

```text
pnpm --filter @keepit/cliente test -- src/navigation/passwordRecoveryLinking.test.ts src/lib/passwordRecoveryPresentation.test.ts

Test Files  2 passed (2)
Tests       17 passed (17)
Exit 0
```

```text
pnpm --filter @keepit/cliente typecheck

Exit 0
```

## Escopo e revisão

- Alterações de implementação limitadas ao presenter/teste de recuperação e à
  tela `EsqueciSenha`; nenhum arquivo do mock ou do Supabase foi modificado.
- O CodeRabbit CLI não está disponível neste ambiente; o diff foi revisado
  localmente e validado com `git diff --check`.
- O Vitest preserva somente o aviso preexistente de depreciação da API CJS do
  Vite.
