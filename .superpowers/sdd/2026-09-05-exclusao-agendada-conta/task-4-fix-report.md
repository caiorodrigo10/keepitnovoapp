# Task 4 fix report — guard após persistência

Status: **DONE**

## Finding corrigido

O callback pós-agendamento atualizava apenas `ExcluirConta`. Como essa tela é
uma rota dentro da tab Perfil, o `beforeRemove` local não impedia a troca para
Home/Pedidos e o lookup do `RootNavigator` permanecia em `Main` durante uma
saída lenta ou rejeitada.

## Correção

- Criada uma seam process-local testável para notificar que um agendamento foi
  persistido.
- `scheduleAccountDeletionAndSignOut` publica o registro antes de iniciar
  `auth.signOut()`.
- O `RootNavigator` assina a notificação, invalida qualquer `status()` pendente
  e muda o lookup raiz para o registro persistido. Isso desmonta `MainTabs`
  durante o logout e conserva a rota restrita se ele falhar.
- O guard reconsulta `status()` quando o app volta ao foreground e também em
  eventos auth da mesma identidade. Não há polling; a consulta não emite auth
  por si mesma, e o request id last-start-wins impede que respostas antigas
  reabram `Main` após notificação ou troca de sessão.

## TDD e validações

- RED: 1 falha / 11 passes — `subscribeAccountDeletionPersisted` ausente.
- GREEN: `pnpm --filter @keepit/cliente test -- src/lib/accountDeletionRoute.test.ts`
  — 1 arquivo / 12 testes PASS.
- A regressão pura prova a ordem `schedule persistido -> guard
  ScheduledDeletion -> sign-out iniciado`, mantém o sign-out pendente e, após
  rejeitá-lo, confirma que o guard continua `ScheduledDeletion`.
- `pnpm --filter @keepit/cliente typecheck`: PASS.
- `git diff --check`: PASS.
- CodeRabbit CLI não está instalado neste ambiente; foi substituído por
  inspeção manual dirigida do diff e pelos gates reproduzíveis acima.
- Nenhum renderer, dependência, APK, polling ou mudança de port foi adicionado.

## Arquivos

- `apps/cliente/src/lib/accountDeletionRoute.ts`
- `apps/cliente/src/lib/accountDeletionRoute.test.ts`
- `apps/cliente/src/navigation/RootNavigator.tsx`
- `.superpowers/sdd/2026-09-05-exclusao-agendada-conta/progress.md`
- `.superpowers/sdd/2026-09-05-exclusao-agendada-conta/task-4-fix-report.md`
