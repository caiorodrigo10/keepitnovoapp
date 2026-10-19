# Task 3 report — seleção imediata de hub e reflexo nas telas

## Status

Complete.

## Implemented

- Replaced `EscolhaRetirada`'s local selection and confirmation button with an immediate async `cart.selectHub` call on each active row.
- Added the shared destructive confirmation copy for hub/store changes and routed the confirmed retry through the same local helper.
- Navigated back only for `committed`/`unchanged` results, with explicit feedback for persistence failures and unavailable hubs.
- Made inactive hubs visibly disabled and non-interactive while retaining `blocked` handling for stale availability races.
- Kept `cart.hubId` as Home's only selected-hub source, removed its first/default-hub fallback, and exposed the textual `Alterar` action beside a resolved selection.
- Removed Checkout's default-hub write, kept `Selecionar hub` for the empty snapshot, and blocked payment both visually and in the handler until a real hub is selected.

## Test approach

- No renderer or UI-test dependency was added, per task scope. These screen-only changes consume the already-covered transaction protocol.
- Baseline `pnpm --filter @keepit/cliente typecheck` passed before the wiring change; the final focused transaction tests and typecheck cover the async API contract and all consumers.

## Verification

- `pnpm --filter @keepit/cliente test -- src/lib/cartRules.test.ts src/lib/cartStorage.test.ts src/lib/cartTransaction.test.ts` — 24/24 passed across 3 files.
- `pnpm --filter @keepit/cliente typecheck` — passed.
- `git diff --check` — passed.
- No renderer/dependencies, APK, or manual evidence were generated.

## Concerns

- UI behavior is intentionally deferred to the single Android QA release in Story 12.14, as required by the brief.
- The temporary `setHubId` compatibility method remains in `CartContext`; Task 3 removes all screen call sites in scope, but deleting that API is outside the exact file list.
