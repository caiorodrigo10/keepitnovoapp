# Final fix report — recuperação de senha real/mock

Data: 2026-09-05
Base da correção: `42e4c10 feat(core-data): model account deletion lifecycle`
Review corrigido: `final-review.md` — 1 HIGH e 1 MEDIUM

## Resultado

### HIGH — cleanup real falha fechado

- `cleanupFailedPasswordRecovery` só limpa o marcador persistido depois que
  `signOut({ scope: 'local' })` resolve com `error: null`.
- Se o SDK retornar `error` ou rejeitar, o marcador continua ativo. Assim,
  `onAuthStateChange` segue impedindo que uma possível sessão parcial de
  recovery seja promovida a login comum.
- O chamador continua recebendo exclusivamente o erro público genérico de
  callback; detalhes do provider, URL e credenciais não escapam do adapter.
- A documentação oficial atual do Supabase confirma o escopo `local` para
  remover somente a sessão corrente. O changelog atual não contém breaking
  change aplicável a esse contrato no `supabase-js` instalado.

### MEDIUM — expiração mock reproduzível via QA

- `DemoScenarioPort.expirePasswordRecovery()` expõe uma seam QA mínima, sem
  datasource paralelo ou nova tela.
- A operação aceita somente a solicitação corrente em `requested`, a move para
  `expired` dentro da barreira serializada existente e persiste pelo mesmo
  snapshot. Falha de escrita usa o rollback já compartilhado; ausência de
  solicitação retorna `unavailable` sem criar estado fictício.
- O Painel QA reutiliza seu gate global de operação, loading e notice para o
  botão “Expirar recuperação pendente”. Não foi adicionado renderer.
- A regressão reabre o `DataClient` com o mesmo storage, confirma
  `passwordRecovery.state = expired` e prova que o callback é recusado após o
  restart.

## Evidência TDD

### RED — cleanup Supabase

```text
pnpm --filter @keepit/core-data test -- src/supabase/auth.supabase.test.ts

Test Files  1 failed (1)
Tests       2 failed | 47 passed (49)
Falha       expected state.active() false to be true
Exit 1
```

### RED — seam QA

```text
pnpm --filter @keepit/core-data test -- src/mock/password-recovery-qa.test.ts

Test Files  1 failed (1)
Tests       2 failed (2)
Falha       expirePasswordRecovery is not a function
Exit 1
```

### GREEN focado dos findings

```text
pnpm --filter @keepit/core-data test -- src/mock/password-recovery-qa.test.ts src/supabase/auth.supabase.test.ts

Test Files  2 passed (2)
Tests       51 passed (51)
Exit 0
```

## Gate final

```text
pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts src/mock/password-recovery-qa.test.ts src/supabase/auth.supabase.test.ts src/index.test.ts

Test Files  6 passed (6)
Tests       166 passed (166)
Exit 0
```

```text
pnpm --filter @keepit/core-data typecheck
pnpm --filter @keepit/cliente typecheck

@keepit/core-data  Exit 0
@keepit/cliente    Exit 0
```

## Escopo e preocupações

- A fila serializada, rollback e reset existentes foram reutilizados, não
  substituídos. O commit concorrente `42e4c10` foi preservado e concluído antes
  desta correção ser aplicada aos arquivos compartilhados.
- Nenhum token, senha, code PKCE ou URL bruta foi armazenado, retornado pela
  seam QA ou adicionado a logs.
- O CodeRabbit CLI não está disponível neste ambiente; o diff foi revisado
  localmente e passa em `git diff --check`.
- O Vitest mantém apenas o aviso preexistente de depreciação da API CJS do
  Vite.
