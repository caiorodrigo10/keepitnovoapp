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

## Correções após review

O review de `cfe1891` identificou dois gaps, corrigidos numa rodada TDD focada:

- As mutações de recovery agora usam uma capacidade de persistência que
  preserva o resultado booleano do state store. Falha ao gravar `requested`,
  `ready` ou senha + `consumed` rejeita com erro genérico e restaura o estado
  anterior em memória; nenhuma dessas operações reporta sucesso degradado.
- O parser recusa `username` e `password` em `userinfo`, mantendo utilizável a
  solicitação canônica que não chegou a ser consumida.

### RED do review

```text
pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/cliente-state-store.test.ts

Test Files  2 failed (2)
Tests       4 failed | 57 passed (61)
Exit 1
```

As quatro falhas reproduziram exatamente os findings: callback com `userinfo`
aceito e sucesso incorreto nas três transições quando `setItem` falhava.

### GREEN após review

```text
pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts

Test Files  3 passed (3)
Tests       97 passed (97)
Exit 0

pnpm --filter @keepit/core-data test

Test Files  32 passed (32)
Tests       641 passed (641)
Exit 0
```

Os testes de falha usam o storage real em memória do arquivo de integração,
com uma rejeição controlada de `setItem`, e provam retry no mesmo processo e
consumo durável após restart.

## Correção após re-review de concorrência

O re-review encontrou uma janela entre a mutação otimista e o rollback: uma
operação concorrente como `signOut` podia capturar senha nova + recovery
`consumed` enquanto a gravação de `updatePassword` ainda estava pendente e,
depois da falha, persistir esse snapshot especulativo na fila.

A unidade inteira de recovery — validação, mutação, captura, gravação e
commit/rollback — agora passa por uma barreira serializada do state store.
Persistências comuns aguardam essa barreira antes de capturar o snapshot;
assim, após uma falha, observam somente o estado já restaurado. As validações
também rodam dentro da unidade serializada, impedindo que duas transições de
recovery validem o mesmo estado em paralelo.

### RED do re-review

```text
pnpm --filter @keepit/core-data test -- src/mock/cliente-state-store.test.ts

Test Files  1 failed (1)
Tests       1 failed | 29 passed (30)
Exit 1
```

O único teste novo bloqueou e fez falhar a primeira gravação de
`updatePassword`, disparou `signOut` em paralelo e reabriu o storage. Antes da
correção, encontrou `senha-transiente` persistida em vez de `keepit123`.

### GREEN após re-review

```text
pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts

Test Files  3 passed (3)
Tests       98 passed (98)
Exit 0

pnpm --filter @keepit/core-data test

Test Files  32 passed (32)
Tests       642 passed (642)
Exit 0
```

O typecheck permanece com somente a falha já registrada e pertencente à Task
2 em `src/supabase/auth.supabase.ts:160`; a correção de concorrência não criou
outros erros de tipo.

## Correção após segundo re-review

O segundo re-review mostrou que `reset()` ainda alterava a memória e
enfileirava o baseline fora da barreira. Um rollback de recovery podia então
ser capturado por uma persistência comum depois da escrita do reset,
ressuscitando `ready` somente no storage.

A barreira agora representa mutações de estado serializadas e inclui o reset
completo: captura do estado anterior, aplicação do baseline, gravação e
callback de limpeza. Persistências comuns só capturam depois do commit ou do
rollback. Quando a gravação do reset falha, contas, sessão, QA, recovery,
snapshot auxiliar e IDs gerenciados voltam ao estado anterior; o resultado é
`{ status: 'degraded' }` e nenhum evento de reset é publicado.

### RED do segundo re-review

```text
pnpm --filter @keepit/core-data test -- src/mock/cliente-state-store.test.ts

Test Files  1 failed (1)
Tests       2 failed | 29 passed (31)
Exit 1
```

Foi adicionado um único teste adversarial: a primeira gravação de
`updatePassword` fica pendente e falha, enquanto reset e `signOut` já foram
iniciados; a gravação do reset também é controlada antes do restart. Sem a
correção, a memória terminava com recovery `null`, mas o storage terminava em
`ready`. A segunda falha veio da atualização do teste existente de reset
degradado, que passou a exigir rollback coerente do estado anterior.

### GREEN após segundo re-review

```text
pnpm --filter @keepit/core-data test -- src/mock/auth.mock.test.ts src/mock/cliente-state.test.ts src/mock/cliente-state-store.test.ts

Test Files  3 passed (3)
Tests       99 passed (99)
Exit 0

pnpm --filter @keepit/core-data test

Test Files  32 passed (32)
Tests       643 passed (643)
Exit 0
```

O typecheck continua apontando exclusivamente a integração da Task 2 em
`src/supabase/auth.supabase.ts:160` (`Promise<void>` versus
`Promise<PasswordResetRequestResult>`).
