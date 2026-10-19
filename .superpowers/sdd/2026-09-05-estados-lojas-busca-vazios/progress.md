# SDD ledger — plan: docs/superpowers/plans/2026-09-05-estados-lojas-busca-vazios.md

Worktree: `/projects/keepitnovoapp/.worktrees/story-12-1-mock-cliente`
Start commit: `b0943e8`

## Pre-flight interface scan

| Tasks | Producer → consumer | Finding / ruling |
|---|---|---|
| 1 → 2,4 | Central availability/public adapters → discovery and checkout | Clean: one domain projection prevents drift. |
| 2 → 3 | Search-visible store/product shapes → view-state matrix | Clean: unavailable stores retain catalog metadata. |
| 2 → 4 | Store availability → catalog/checkout UI | Clean: browsing and purchasing are separated. |
| 1 | Adapter/RLS tests ↔ public population | Clean: security boundary remains explicit. |
| 2,3,4 | Pure tests/typechecks ↔ screen wiring | Ruling: targeted domain/view tests and typecheck now; contrast/layout/navigation use the single final APK smoke — avoids renderer and visual matrices for MVP — cost if wrong: visual-only issue is found at final smoke. |
| 1 | Supabase RLS migration ↔ current platform guidance | Ruling: preserve explicit roles, RLS predicates, owner branch and server-side purchase block; no live remote apply before branch review — safer reversible migration workflow — cost if wrong: local SQL needs adjustment before deployment. |

Task 1: complete (commit 9983afb, security/domain review clean; remote migration intentionally not applied)
Task 2: complete (commit 0083b25, review clean; favorites intentionally remain unfiltered)
Task 3: complete (commit b66ee78, review clean; SearchBar submit omission accepted for MVP because result/suggestion taps record recent queries)
Task 4: fix round 1/5 (1 HIGH addressed, 0 open; commit b9eb5cb)
Ruling: park LOW renderer integration and unavoidable client/server availability race; focused boundary tests, server-side RPC guards and final APK smoke are sufficient for MVP — cost if wrong: a UI-only issue or narrow timing edge is found later.
Task 4: complete (commits 7fb4806..b9eb5cb, scoped rereview clean)
Final fix wave: commit edfa6f5; direct general suggestions now apply category-only filters.
Ruling: park the residual session-only recent replay of suggestion labels; direct suggestions and ordinary text recent queries work, while preserving category metadata in the recent model would broaden the MVP state contract — cost if wrong: replaying a category suggestion from the temporary recent list can show an empty result until the user taps the suggestion again.
Final fix wave 2: complete in the scoped follow-up commit; the residual HIGH is closed by preserving category recents as `{ kind: 'category', label, category }`, replaying the canonical category on both search screens and migrating known legacy string labels on read.
Ruling: keep ordinary text recents as strings for backwards compatibility and limit legacy inference to the three canonical general suggestions; no storage, renderer or shared `SearchBar` contract was added.
