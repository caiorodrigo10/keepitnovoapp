# Task 2 report — adapter real e callback único

Data: 2026-09-05
Base da task: `f372548 fix(core-data): serialize mock scenario reset`

## Resultado

- O adapter Supabase agora devolve `{ delivery: 'email' }` somente depois de
  `resetPasswordForEmail` resolver sem erro e nunca ecoa o endereço informado.
- Falhas de callback — URL errada, erro do provider, userinfo disfarçado,
  sessão ausente ou troca rejeitada — tentam encerrar a sessão parcial com
  `signOut({ scope: 'local' })`, limpam o marcador de recovery e expõem somente
  um erro genérico.
- Os fluxos implícito e PKCE exigem uma sessão não nula na resposta do SDK.
- A troca de senha continua aguardando `updateUser`, `signOut` e a limpeza do
  recovery state antes de resolver. Sem uma nova sessão de recovery, uma
  segunda troca é rejeitada localmente.
- O linking aceita o callback canônico real ou mock, rejeita userinfo e devolve
  exclusivamente `?recovery=ready|invalid`; `access_token`, `refresh_token`,
  `code` e `requestId` não chegam ao estado de navegação.
- `config.toml` mantém um único `additional_redirect_urls`, exatamente
  `com.keepithub.cliente://auth/reset`.

## Semântica observada do Supabase

Foram relidos o changelog, o guia atual de password recovery e as referências
de `resetPasswordForEmail`, `onAuthStateChange`, `updateUser` e `signOut`. O
lockfile instala `@supabase/supabase-js@2.111.0`; o código instalado confirma as
mesmas APIs e o evento `PASSWORD_RECOVERY`.

A documentação confirma links de autenticação de uso único e que
`resetPasswordForEmail` pode ser chamado novamente para reenviar a recuperação,
mas não promete que uma nova solicitação revogue imediatamente todos os links
anteriores. O adapter real, portanto, delega cada solicitação ao provider e não
simula uma garantia local adicional.

## Evidência TDD

### RED

```text
pnpm --filter @keepit/core-data test -- src/supabase/auth.supabase.test.ts

Test Files  1 failed (1)
Tests       8 failed | 37 passed (45)
Exit 1
```

As falhas cobriram o retorno ainda ausente, erros não genéricos, falta de
cleanup, aceitação de userinfo e resposta sem sessão aceita como sucesso.

```text
pnpm --filter @keepit/cliente test -- src/navigation/passwordRecoveryLinking.test.ts

Test Files  1 failed (1)
Tests       1 failed | 9 passed (10)
Exit 1
```

O linking ainda aceitava userinfo quando host/path aparentavam ser canônicos;
os casos já seguros de cold start e app aberto permaneceram verdes.

### GREEN focado

```text
pnpm --filter @keepit/core-data test -- src/supabase/auth.supabase.test.ts

Test Files  1 passed (1)
Tests       45 passed (45)
Exit 0

pnpm --filter @keepit/cliente test -- src/navigation/passwordRecoveryLinking.test.ts

Test Files  1 passed (1)
Tests       10 passed (10)
Exit 0
```

## Typecheck e revisão

```text
pnpm --filter @keepit/core-data typecheck
Exit 0

pnpm --filter @keepit/cliente typecheck
Exit 0
```

Os dois typechecks passaram juntos após a implementação. Na verificação fresca
pré-commit, mudanças concorrentes fora da Task 2 passaram a produzir 17 erros
em `src/mock/cliente-state-store.ts:186` e `src/mock/order.mock.ts` (chamadas
com aridade incompatível). Nenhum erro aponta para os arquivos desta task. Por
orientação do coordenador, esses arquivos mock concorrentes não foram tocados e
o typecheck amplo será repetido depois que a rodada responsável estabilizar.

- `git diff --check` dos cinco arquivos da task passou.
- A mutação mental confirma cobertura para retorno vazio, callback fora do
  `try`, cleanup/sign-out ausentes, sessão nula aceita, replay liberado e URL
  bruta devolvida.
- O CodeRabbit CLI não está instalado neste ambiente. A restrição explícita de
  não usar subagentes foi respeitada; a revisão foi local contra o brief e o
  diff.
- O Vitest imprime o aviso preexistente de depreciação da API CJS do Vite; não
  houve erro ou warning novo da implementação.
- Não foram executadas suites amplas nem gerado APK, conforme o escopo focado
  desta task.

## Pendência de smoke hospedado

O conector disponível não expõe leitura da configuração hospedada de Auth URL,
e nenhuma configuração remota foi mutada. No smoke único da Story 12.14,
confirmar no staging, antes do fluxo real, que **Authentication > URL
Configuration > Redirect URLs** contém a entrada exata
`com.keepithub.cliente://auth/reset`; então solicitar o e-mail, abrir o link e
verificar que a navegação recebe somente `recovery=ready|invalid`, sem registrar
URL bruta ou tokens.
