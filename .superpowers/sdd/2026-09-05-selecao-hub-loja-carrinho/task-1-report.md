# Task 1 report — planos puros para troca de hub e loja

## Status

Complete.

## Implemented

- Exported `CartOrderState`, `AddItemInput`, and the discriminated `CartTransition` union from `cartRules.ts`.
- Added immutable `planHubSelection` branches for unavailable, unchanged, confirmation-required, and ready transitions.
- Added immutable `planItemAddition`, reusing `shouldConfirmStoreSwitch`, replacing the cart on a confirmed store switch, and accumulating quantity for an existing product in the same store.
- Added the specified decision matrix without React mocks or renderer dependencies.

## TDD evidence

- RED: `pnpm --filter @keepit/cliente test -- src/lib/cartRules.test.ts` failed with 6 expected failures because both planners were absent; the 4 legacy tests passed.
- GREEN: the same focused command passed 10/10 tests after the minimal implementation.

## Verification

- `pnpm --filter @keepit/cliente test -- src/lib/cartRules.test.ts` — 10/10 passed.
- `pnpm --filter @keepit/cliente typecheck` — passed.
- `pnpm --filter @keepit/cliente test` — 266/266 passed across 38 files.
- `git diff --check -- apps/cliente/src/lib/cartRules.ts apps/cliente/src/lib/cartRules.test.ts` — passed.

## Concerns

- No implementation concerns found in the scoped diff.
- A reviewer subagent was not used because this task explicitly prohibited subagents.
- Existing concurrent QA/order worktree changes were preserved and excluded from this task's staged files.
