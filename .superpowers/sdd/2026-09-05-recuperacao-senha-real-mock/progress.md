# SDD ledger — plan: docs/superpowers/plans/2026-09-05-recuperacao-senha-real-mock.md

Worktree: `/projects/keepitnovoapp/.worktrees/story-12-1-mock-cliente`
Start commit: `ae24991`

## Pre-flight interface scan

| Tasks | Producer → consumer | Finding / ruling |
|---|---|---|
| 1 → 3 | Discriminated reset result/mock callback → UI presentation | Clean: UI follows capability, not datasource flag. |
| 1 → 2 | AuthPort return contract → Supabase adapter/link sanitizer | Clean: mock ID and real secrets remain behind adapter boundary. |
| 2 → 3 | Safe callback route → screens | Clean: raw URL/query/hash never reaches navigation params. |
| 1 | Mock lifecycle tests ↔ persistence/replay/reset | Clean: security-critical focused paths only. |
| 2 | Supabase adapter/link tests ↔ current docs | Clean: resetPasswordForEmail/PASSWORD_RECOVERY/updateUser flow verified against official docs and installed API. |
| 3 | Presenter/UI ↔ final staging smoke | Ruling: focused pure/link/auth tests and typecheck now; actual email/deep-link/device flows use the one final APK smoke — avoids duplicate manual cycles for MVP — cost if wrong: hosted redirect/SMTP issue is found at final smoke. |

Task 1: fix rounds 1–3 addressed persistence failure, URL userinfo, recovery/signOut capture, and reset serialization; residual concurrent failed-reset/auth rollback escalated to fresh round-4 implementer.
Task 1: complete (commits cfe1891..d71dd0f, fix round 4 review clean; generic Cliente mutation serialization)
Task 2: fix round 1/5 (1 HIGH addressed, 0 open; commit efce4bd)
Task 2: complete (commits c0ca1cd..efce4bd, scoped rereview clean; hosted allow-list deferred to Story 12.14)
Task 3: fix round 1/1 (1 MEDIUM addressed; callback demo one-shot, CTA loading/disabled, focused no-renderer regression)
Task 3: complete (commit 05e709d + corrective commit; final device behavior remains deferred to Story 12.14)
Final review: fix round 1/1 (1 HIGH + 1 MEDIUM addressed; cleanup real fail-closed and recovery mock expired via DemoScenarioPort/PainelQA)
Final review: complete (focused regressions + core-data/cliente typechecks; final device behavior remains deferred to Story 12.14)
