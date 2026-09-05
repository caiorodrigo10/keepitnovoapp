# Task 3 fix report — reconciliação e isolamento da exclusão mock

Status: **DONE**

## Findings fechados

### HIGH — vencimento independente de `advanceClock`

- A transição `scheduled -> completed` foi centralizada em uma reconciliação
  que considera o relógio compartilhado (`Date.now() + clockOffsetMs`) e trata
  o instante exato `deleteAt` como vencido.
- Hydrate reconcilia antes de concluir a inicialização. `status()` e `cancel()`
  executam a mesma operação dentro da fila serializada existente.
- Conclusão e bloqueio do perfil são uma única mutação rollbackable. Se a
  escrita falhar no hydrate, ambos voltam ao estado anterior; se falhar durante
  `status`/`cancel`, a chamada rejeita e o cancelamento pós-prazo não ocorre.
- `advanceClock(ms)` passou a reutilizar a mesma regra, preservando o rollback
  conjunto de relógio, solicitação e perfil.

### MEDIUM — isolamento por conta

- O snapshot foi promovido de V6 para V7 e agora persiste
  `accountDeletionsByClienteId`, alinhado aos demais estados multi-conta do
  mock.
- A migração V6 move o singleton para a chave do `clienteId`; V1–V5 continuam
  migrando pela cadeia existente e chegam à V7.
- Leitura, escrita, idempotência e cancelamento são scoped pela sessão atual.
  Duas contas mantêm prazos independentes após restart, e reset limpa o mapa
  completo com o rollback já existente em caso de falha.

## TDD e validações

- RED: 4 falhas direcionadas para V6→V7, reopen vencido, falha de persistência
  no boundary e isolamento de duas contas.
- GREEN focado:
  `pnpm --filter @keepit/core-data test -- src/mock/account-deletion.mock.test.ts src/supabase/account-deletion.supabase.test.ts src/mock/cliente-state-store.test.ts src/mock/cliente-state.test.ts src/index.test.ts`
  — 5 arquivos / 94 testes PASS.
- Suíte completa: `pnpm --filter @keepit/core-data test` — 35 arquivos / 671
  testes PASS.
- `pnpm --filter @keepit/core-data typecheck`: PASS.
- `git diff --check`: PASS.

## Escopo preservado

- O adapter Supabase e seu contrato público não foram alterados.
- O fluxo de recuperação de senha introduzido em `ec562dd` foi preservado.
- Nenhum cron, finalizador real ou regra destrutiva foi criado; o gate de
  retenção da Task 2 permanece bloqueante.

Commit: enclosing Task 3 fix commit.
