# Task 3 report — AccountDeletionPort real/mock e relógio QA

Status: **DONE**

## Entrega

- Criada a porta comum `AccountDeletionPort` com `status`, `schedule` e
  `cancel`.
- Adapter Supabase usa exclusivamente `functions.invoke('account-deletion')`,
  deixa identidade e prazo sob controle do serviço e falha fechado para erros
  do SDK, corpo de erro, payload inválido ou schedule vazio.
- Adapter mock exige sessão, valida a senha atual, mantém schedule/cancel
  idempotentes e persiste pela fila serializada antes de resolver.
- Snapshot mock promovido a V6 com migração retrocompatível de V1–V5 e
  persistência do ciclo de exclusão por conta.
- `DemoScenarioPort.advanceClock(ms)` avança o mesmo relógio persistido do mock.
  No vencimento, a demonstração marca `completed` e bloqueia a credencial; uma
  falha de storage reverte relógio, conclusão e bloqueio. O reset recupera o
  baseline de `cliente-ana` com senha `keepit123`.
- Nenhum finalizador real, cron, service-role no cliente ou regra destrutiva de
  retenção foi criado.

## TDD e validações

- RED inicial: adapters ausentes, `DataClient.accountDeletion` ausente e
  snapshot ainda em V5 (12 falhas / 74 passes no recorte inicial).
- GREEN focado após implementação: 5 arquivos / 90 testes PASS.
- `pnpm --filter @keepit/core-data typecheck`: PASS antes do WIP concorrente.
- Typecheck fresco da mesma configuração, excluindo somente o novo arquivo WIP
  concorrente `password-recovery-qa.test.ts`: PASS.
- A suíte completa foi executada como diagnóstico adicional e encontrou quatro
  falhas exclusivamente no WIP concorrente de recuperação de senha: duas em
  `auth.supabase.test.ts` e duas no novo `password-recovery-qa.test.ts`. Após a
  criação desse teste não versionado, o typecheck global também passou a falhar
  por `expirePasswordRecovery` ainda não existir na composição. O responsável
  foi avisado; esses arquivos não foram editados nem serão staged nesta Task 3.
- `git diff --check`: PASS.

## Arquivos da Task 3

- `packages/core-data/src/ports/account-deletion.port.ts`
- `packages/core-data/src/supabase/account-deletion.supabase.ts`
- `packages/core-data/src/supabase/account-deletion.supabase.test.ts`
- `packages/core-data/src/mock/account-deletion.mock.ts`
- `packages/core-data/src/mock/account-deletion.mock.test.ts`
- `packages/core-data/src/mock/cliente-state.ts`
- `packages/core-data/src/mock/cliente-state.test.ts`
- `packages/core-data/src/mock/cliente-state-store.ts`
- `packages/core-data/src/mock/cliente-state-store.test.ts`
- `packages/core-data/src/ports/demo-scenario.port.ts`
- `packages/core-data/src/index.ts`
- `packages/core-data/src/index.test.ts`

## Residual deliberado

O datasource real apenas agenda, consulta e cancela. Processamento destrutivo e
cron continuam bloqueados pela política de retenção pendente, conforme o plano.
