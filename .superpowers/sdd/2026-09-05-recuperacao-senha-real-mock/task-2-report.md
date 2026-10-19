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
- O app Cliente agora cria o Supabase Auth com `flowType: 'pkce'`; o wrapper
  encaminha essa opção ao SDK e o adapter aceita somente callback com `code`.
  Callbacks implícitos legados são recusados sem entregar seus tokens a
  `setSession`, fechando a restauração de JWT ainda válido após `signOut`.
- A troca de senha continua aguardando `updateUser`, `signOut` e a limpeza do
  recovery state antes de resolver. Uma guarda adquirida antes do primeiro
  `await` admite somente um `updateUser` em voo por adapter; chamadas
  concorrentes e uma segunda troca sem nova sessão são rejeitadas localmente.
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

A recuperação efetiva usa PKCE: o SDK guarda o verifier no storage já
injetado pelo app, envia o challenge em `resetPasswordForEmail` e troca o
`code` via `exchangeCodeForSession`. O provider consome o authorization code;
reapresentar o mesmo callback falha sem reativar o estado nem chamar um segundo
`updateUser`. Nenhum fingerprint, token, code ou URL bruta foi persistido ou
registrado pela aplicação.

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

### Remediação da revisão — RED

```text
pnpm --filter @keepit/core-data test -- src/supabase/auth.supabase.test.ts

Test Files  1 failed (1)
Tests       2 failed | 45 passed (47)
Exit 1
```

As falhas reproduziram a restauração pelo callback implícito legado e duas
chamadas concorrentes chegando a `updateUser`.

```text
pnpm --filter @keepit/supabase-client test -- src/index.test.ts

Test Files  1 failed (1)
Tests       1 failed | 8 passed (9)
Exit 1

pnpm --filter @keepit/cliente test -- src/lib/dataClientBootstrap.test.ts

Test Files  1 failed (1)
Tests       1 failed | 9 passed (10)
Exit 1
```

O wrapper mantinha o default `implicit` do SDK e o bootstrap não solicitava
PKCE.

### Remediação da revisão — GREEN focado

```text
pnpm --filter @keepit/core-data test -- src/supabase/auth.supabase.test.ts
Tests       47 passed (47)
Exit 0

pnpm --filter @keepit/supabase-client test -- src/index.test.ts
Tests       9 passed (9)
Exit 0

pnpm --filter @keepit/cliente test -- src/lib/dataClientBootstrap.test.ts
Tests       10 passed (10)
Exit 0
```

O caso de replay reapresenta o mesmo callback PKCE depois de uma troca completa:
o provider fake recusa o `code` consumido, o adapter executa cleanup genérico e
`updateUser` permanece com uma única chamada. O caso concorrente mantém o
primeiro `updateUser` pendente e prova que o segundo não cruza a guarda.

## Typecheck e revisão

```text
pnpm --filter @keepit/core-data typecheck
Exit 0

pnpm --filter @keepit/supabase-client typecheck
Exit 0

pnpm --filter @keepit/cliente typecheck
Exit 0
```

Os typechecks de `@keepit/core-data`, `@keepit/supabase-client` e
`@keepit/cliente` foram executados em paralelo depois da remediação e os três
retornaram exit 0. Os dois typechecks originalmente exigidos (`core-data` e
`cliente`) também haviam passado juntos antes das alterações concorrentes da
Task 1; nenhum arquivo de state store/mock foi tocado nesta task.

- `git diff --check` dos arquivos rastreados da task passou.
- A mutação mental confirma cobertura para retorno vazio, callback fora do
  `try`, cleanup/sign-out ausentes, sessão nula aceita, reativação por callback
  implícito, `flowType` não encaminhado, corrida concorrente e URL bruta
  devolvida.
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
