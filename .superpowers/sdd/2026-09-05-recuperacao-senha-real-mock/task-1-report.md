# Task 1 report — ciclo de recuperação mock persistente

Data: 2026-09-05
Base do snapshot: `ae24991 fix(core-data): isolate mock favorites by cliente`

## Resultado

- `AuthPort.requestPasswordReset` agora devolve a capacidade discriminada
  `email | demo`; o mock entrega somente a rota canônica com um `requestId`
  opaco.
- O snapshot Cliente avançou de V4 para V5 com
  `passwordRecovery: MockPasswordRecovery`, migrando V1–V4 para
  `passwordRecovery: null` sem perder os favoritos isolados por conta.
- A validação aceita apenas `requested`, `ready`, `expired` e `consumed`,
  exige conta existente, restringe o formato do ID opaco e rejeita campos
  extras no recovery (inclusive senha/e-mail/token acidental).
- Solicitação, estabelecimento de callback e consumo persistem antes de
  resolver. Uma nova solicitação substitui a anterior; callback antigo,
  expirado, consumido, desconhecido ou com ID divergente não altera senha.
- E-mail inexistente recebe a mesma forma de resposta demo e seu callback
  falha genericamente, sem revelar existência da conta.
- A senha nova permanece somente em `accounts[].password`; o estado de
  recovery guarda somente `requestId`, `clienteId` e `state`.
- Reset limpa o recovery, restaura `keepit123` e preserva o comportamento de
  limpeza dos favoritos por conta.

## Evidência TDD

### RED

```text
pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts

Test Files  3 failed (3)
Tests       18 failed | 75 passed (93)
Exit 1
```

As falhas foram as esperadas: retorno demo ausente, baseline/migração ainda
em V4, recovery não validado e ciclo não persistido.

### GREEN focado

```text
pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts

Test Files  3 passed (3)
Tests       93 passed (93)
Exit 0
```

Cobertura focada: retorno/URL opaca, anti-enumeração, restart em
`requested`, `ready` e `consumed`, replay, `expired`, nova solicitação,
login com a senha nova, migração V4 com favoritos e reset.

## Verificação

- `git diff --check` nos arquivos da Task 1 — PASS.
- Varredura focada por `access_token`, `refresh_token`, `password=`, `senha=`
  e `email=` nos arquivos alterados — nenhuma ocorrência.
- CodeRabbit CLI não está instalado neste ambiente; revisão automatizada
  externa não foi executada.
- Não foram adicionadas dependências nem executados testes amplos, conforme
  o brief de delegação.

## Typecheck e preocupações

`pnpm --filter @keepit/core-data typecheck` chega a uma única falha fora dos
arquivos desta task:

```text
src/supabase/auth.supabase.ts(160,11): error TS2322:
Promise<void> não é atribuível a Promise<PasswordResetRequestResult>.
```

Essa é a integração deliberadamente pertencente à Task 2: o adapter real
ainda precisa retornar `{ delivery: 'email' }`. Os arquivos da Task 1 não
produziram outro erro de tipo. A restrição de não usar subagentes impediu a
revisão externa prevista pelo workflow; foi feito self-review contra o brief.
