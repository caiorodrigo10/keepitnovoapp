# SDD ledger — plan: docs/superpowers/plans/2026-09-05-exclusao-agendada-conta.md

Worktree: `/projects/keepitnovoapp/.worktrees/story-12-1-mock-cliente`
Supabase development project: `jhhbewnmnorhmsdvfppo` (`keepit-dev`)

## Pre-flight interface scan

| Tasks | Producer → consumer | Finding / ruling |
|---|---|---|
| 1 → 3 | Secure schedule/status/cancel service → adapters | Clean: user identity derives from JWT, not screen input. |
| 3 → 4 | Unified port/mock clock → app/public UI | Clean: same seven-day lifecycle without UI datasource branching. |
| 1 → 2 | Scheduled rows → destructive processor | Blocked by missing field-by-field retention/anonymization policy. |
| 1 | RLS/handler tests ↔ auth/ownership/idempotency | Clean: focused security boundary only. |
| 2 | Destructive finalizer ↔ policy artifact | Ruling: do not implement or deploy Task 2 because the mandatory retention matrix is absent and current business doc still specifies manual WhatsApp deletion; deliver reversible schedule/cancel/due mock/UI only — prevents irreversible data loss — cost if wrong: due real accounts remain scheduled and require approved later processor. |
| 3,4 | Adapter/pure route tests ↔ Android/web | Ruling: focused tests/typechecks now and one final Android smoke; no manual matrix — MVP scope — cost if wrong: visual wiring issue appears at final smoke. |

## Task 1

- Implemented the additive `account_deletion_requests` lifecycle with forced
  RLS, owner-only SELECT, no direct authenticated DML, exact seven-day server
  deadline and a partial unique active-request index.
- Implemented/deployed authenticated `account-deletion` v1 on keepit-dev only,
  with JWT-derived identity, per-request password reauthentication and
  idempotent schedule/cancel behavior.
- Remote canonical migration: `20260905183409_account_deletion_lifecycle`.
- Remote transactional proof: exact deadline, active uniqueness, owner SELECT,
  cross-user invisibility and direct INSERT/UPDATE denial passed and rolled back.
- Advisors: no findings introduced for `account_deletion_requests`; reported
  warnings are pre-existing objects elsewhere in keepit-dev.
- Ruling: Supabase CLI is unavailable, so MCP migration history, SQL proof,
  advisors and generated types are the materialization evidence — avoids adding
  tooling to the MVP — cost if wrong: local reset coverage remains deferred to
  the repository's future CLI-enabled environment.
- Residual: destructive due processing/cron remains intentionally absent under
  the global retention-policy gate.

Task 1: complete (commit `8704b84`, task implementation self-reviewed; controller review pending)

### Task 1 review fix

- Review inicial: FAIL com dois HIGH (cancelamento após prazo/corrida e FK
  `ON DELETE CASCADE` antecipando a política de auditoria), mais dois LOW
  (body nulo e prova DELETE ausente).
- Migration corretiva canônica keepit-dev:
  `20260905184421_fix_account_deletion_boundary_and_audit`.
- Ruling: usar `ON DELETE RESTRICT` até a política aprovada — não escolhe
  apagar/reter/anonimizar e impede destruição acidental — custo se errado: o
  finalizador futuro deverá trocar explicitamente a FK dentro da migration da
  política antes de remover Auth.
- Cancelamento real agora usa RPC `SECURITY INVOKER`, executável somente por
  service role, com `status = 'scheduled' AND delete_at > now()` no mesmo
  `UPDATE`.
- Edge Function keepit-dev `account-deletion` v2 ACTIVE, `verify_jwt=true`.
- Prova remota transacional: dentro do prazo cancela; vencido não cancela;
  `anon`/`authenticated` não executam RPC; FK restringe Auth delete; rollback.
- Parser estrito devolve 400 para `null`, ação/campo/tipo inválido e rejeita ID
  de conta no body.
- Teste SQL agora prova DELETE direto negado.
- Handler 7/7 PASS; typechecks Supabase/shared-types PASS; diff-check PASS.
- Advisors security/performance: nenhum finding para os objetos da Task.

Task 1 fix: complete (commit `2dac830`)

## Task 3

- Added one `AccountDeletionPort` contract and composed it in both data
  sources, so consumers do not branch between mock and Supabase.
- The real adapter calls only the authenticated `account-deletion` Edge
  Function, sends no client identity, preserves service-owned deadlines and
  rejects SDK, structured-body, empty-schedule and malformed responses.
- The mock reauthenticates the active account, schedules exactly seven days on
  the shared QA clock and persists schedule/cancel before resolving. Mutations
  use the existing serialized rollback queue; a failed write rolls back both
  in-memory state and the store's last snapshot before retry.
- Snapshot schema advanced from V5 to V6. V1–V5 remain readable; the dormant
  V5 `{ requestedAt }` shape migrates to an owned `scheduled` record with an
  exact seven-day deadline.
- `advanceClock(ms)` exists only on the mock demo scenario. Reaching the due
  instant demonstratively marks the request `completed` and blocks the mock
  profile; reset clears the request and restores Ana/`keepit123`. No real
  finalizer, destructive policy or cron was introduced.
- Focused gate: 5 files / 90 tests PASS. Package typecheck passed before an
  unrelated concurrent password-recovery test was created; a fresh scoped
  typecheck excluding only that WIP also passed. The global command now fails
  only because the concurrent test references its not-yet-composed
  `expirePasswordRecovery` method. The concurrent owner was notified and none
  of those files are included in this task.

Task 3: complete (commit: enclosing Task 3 commit)

### Task 3 review fix

- Review: FAIL com um HIGH (prazo vencido podia ser cancelado sem
  `advanceClock`) e um MEDIUM (snapshot/mock guardava somente uma solicitação
  para todas as contas).
- O snapshot mock avançou de V6 para V7 com
  `accountDeletionsByClienteId`. Payloads V1–V6 continuam legíveis; o registro
  singleton V6 é migrado para a chave do seu `clienteId` sem alterar prazo ou
  estado.
- Uma reconciliação única usa `Date.now() + clockOffsetMs`, conclui todos os
  `scheduled` com `deleteAt <= now` e bloqueia os respectivos perfis. Hydrate,
  `status`, `cancel`, `schedule` e `advanceClock` reutilizam essa operação.
- Em hydrate, a conclusão e o bloqueio são persistidos antes da exposição do
  client; falha de storage reverte ambos. Em `status`/`cancel`, a operação passa
  pela fila serializada rollbackable e falha fechada, impedindo cancelamento no
  instante limite quando a reconciliação não pôde ser persistida.
- Agendamentos de duas contas sobrevivem ao restart e mutações de uma conta não
  substituem a outra. Reset limpa o mapa inteiro e restaura o baseline.
- TDD RED: 4 falhas direcionadas confirmaram migração ausente, falta de
  reconciliação em reopen/boundary e perda multi-conta.
- Gate focado: 5 arquivos / 94 testes PASS. Suíte completa do core-data: 35
  arquivos / 671 testes PASS. Typecheck e diff-check PASS.

Task 3 fix: complete (commit: enclosing Task 3 fix commit)

## Task 4

- O guard raiz agora consulta `AccountDeletionPort.status()` antes de montar
  `Main`: loading, erro e qualquer estado não cancelado falham fechados na
  rota `ScheduledDeletion`. Resultados antigos são invalidados quando a sessão
  muda e refreshes de token da mesma conta não causam nova montagem/flicker.
- `ExcluirConta` explica o prazo de sete dias, exige confirmação explícita e
  senha atual, persiste o agendamento e somente depois encerra a sessão. Se o
  agendamento persistiu mas o sign-out falhou, a própria tela fica bloqueada e
  oferece apenas nova tentativa de saída.
- Novo login de uma conta agendada expõe apenas o prazo, recuperação e saída;
  cancelamento só libera `Main` quando a port confirma `cancelled`/ausência da
  solicitação. Estados vencidos/terminais continuam restritos.
- O `PainelQA` avança o relógio mock em oito dias pela port de cenário, sem
  finalizador real ou cron.
- A rota pública `/conta/exclusao` usa e-mail/senha e a mesma
  `AccountDeletionPort` para consultar, agendar com confirmação de senha ou
  cancelar. Toda ação encerra a sessão após persistir; falha de sign-out
  bloqueia novas ações. A página não importa service key e informa somente que
  o canal de suporte ainda não está disponível.
- TDD RED: o primeiro stub do resolver deixou 8 cenários de autorização
  falhando; o stub posterior de orquestração deixou falhar a prova de sign-out
  após persistência. GREEN: 11/11 testes focados.
- Gate final: teste focado e typechecks de cliente, admin, core-data e Supabase
  PASS; `git diff --check` PASS. Sem renderer, dependências, APK, finalizador ou
  cron, conforme escopo MVP.

Task 4: complete (commit: enclosing Task 4 commit)

### Task 4 review fix

- Review: FAIL com um HIGH — após `schedule()` persistir, somente a tela
  aninhada era atualizada; o lookup raiz continuava liberando `MainTabs`
  durante uma saída lenta ou falha.
- `scheduleAccountDeletionAndSignOut` agora publica uma notificação local
  imediatamente após a port resolver e antes de iniciar o sign-out. O
  `RootNavigator` assina a seam, invalida consultas antigas e promove o
  registro persistido para o lookup raiz, desmontando `Main` sem depender da
  navegação da tela de Perfil.
- Mudanças externas da mesma conta são revalidadas ao retornar ao foreground e
  em eventos de auth (incluindo refresh de token). A chamada de status não
  muda auth e o request id existente descarta respostas sobrepostas/antigas,
  evitando loop e regressão de corrida entre sessões.
- TDD RED: 1 falha / 11 passes mostrou a seam ainda ausente. GREEN: 1 arquivo
  / 12 testes, incluindo `schedule resolvido -> guard restrito -> sign-out
  pendente/rejeitado`.
- Gate focado: teste e typecheck do app Cliente PASS; diff-check PASS.

Task 4 fix: complete (commit: enclosing Task 4 fix commit)

### Task 4 review fix 2

- Rereview: o HIGH foi fechado; restou um MEDIUM em dois interleavings. Um
  `status()` antigo podia sobrescrever cancelamento confirmado, e a notificação
  de schedule não identificava a sessão que iniciou a operação.
- A geração de lookup foi encapsulada num coordenador puro. `begin/complete`
  aceita somente a carga corrente e todo `commit` autoritativo avança a
  geração. Schedule e cancelamento usam o mesmo commit; resposta anterior não
  pode re-restringir `Main`.
- Schedule agora captura `{ clienteId, epoch }`. O Root mantém o epoch estável
  em refresh da mesma identidade e troca-o em logout/troca de conta. Evento,
  callback local e sign-out são descartados quando o token fica obsoleto.
- Antes de sair, a identidade corrente também é confirmada por `currentUser()`;
  isso cobre a janela em que o provider já trocou a sessão mas o callback do
  Root ainda não chegou, sem encerrar a conta nova.
- TDD RED: falhas focadas provaram coordenador ausente, evento ainda não
  associado e ausência da checagem de identidade. GREEN: 1 arquivo / 15 testes
  PASS. Typecheck Cliente e diff-check PASS.

Task 4 fix 2: complete (commit: enclosing Task 4 fix 2 commit)
