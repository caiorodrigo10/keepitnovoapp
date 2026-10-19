# Task 4 fix 2 report — cancelamento e identidade concorrentes

Status: **DONE**

## Findings corrigidos

1. Um `status()` iniciado antes de `cancel()` podia resolver depois e
   sobrescrever o cancelamento confirmado, restringindo novamente a conta.
2. A notificação pós-schedule carregava somente o registro. Se auth trocasse
   enquanto a operação estivesse pendente, o Root podia aplicar o registro e
   o helper podia encerrar a sessão da conta nova.

## Correção

- Criado um coordenador puro para as gerações do lookup. `begin()` inicia uma
  carga, `complete()` aceita apenas a geração atual e `commit()` invalida todas
  as cargas anteriores ao aplicar uma mutação autoritativa.
- `RootNavigator` usa `commit()` tanto para schedule quanto para
  `onDeletionChange`; cancelamento confirmado não pode ser revertido por
  resposta atrasada.
- A sessão do guard possui token `{ clienteId, epoch }`. Eventos de refresh da
  mesma conta preservam o epoch; logout ou troca de identidade o invalidam.
- A notificação de schedule carrega esse token e o Root rejeita eventos que não
  pertencem mais à sessão ativa. O helper também interrompe callback local e
  sign-out quando o token muda.
- Após persistir e notificar fail-closed, o helper confirma `auth.currentUser()`
  antes do sign-out. Assim, uma troca ainda não propagada pelo callback auth
  também não encerra a conta errada.

## TDD e validações

- RED do cancelamento: 1 falha / 12 passes com o coordenador ausente.
- RED da sessão: 1 falha / 13 passes com a seam ausente e, após o stub mínimo,
  1 falha / 13 passes porque evento/callback/sign-out ainda atravessavam a
  troca de identidade.
- RED da confirmação real: 1 falha / 14 passes porque identidade divergente
  ainda recebia callback e sign-out.
- GREEN: `pnpm --filter @keepit/cliente test -- src/lib/accountDeletionRoute.test.ts`
  — 1 arquivo / 15 testes PASS.
- `pnpm --filter @keepit/cliente typecheck`: PASS.
- `git diff --check`: PASS.
- CodeRabbit CLI não está instalado neste ambiente; revisão manual dirigida e
  gates reproduzíveis foram usados como fallback.
- Sem renderer, dependência, APK, polling ou alteração de port.

## Arquivos

- `apps/cliente/src/lib/accountDeletionRoute.ts`
- `apps/cliente/src/lib/accountDeletionRoute.test.ts`
- `apps/cliente/src/navigation/RootNavigator.tsx`
- `.superpowers/sdd/2026-09-05-exclusao-agendada-conta/progress.md`
- `.superpowers/sdd/2026-09-05-exclusao-agendada-conta/task-4-fix2-report.md`
