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
