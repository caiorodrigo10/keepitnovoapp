---
name: feedback-app-only-scope-discipline
description: When a mission explicitly scopes @dev to "app side" with backend already applied, do NOT touch apps/supabase/supabase/migrations/ even if an adjacent story's AC depends on an unapplied migration — flag it and leave story status honest instead
metadata:
  type: feedback
---

In the Keepit orchestration model, migrations are applied by
`@data-engineer` (often pre-applied via MCP by the orchestrator before the
`@dev` session even starts). When a spawn prompt says "Backend JÁ PRONTO"
and lists explicit app-side deliverables, that is a hard boundary — even
when a story's AC literally requires a migration that turns out NOT to be
applied (e.g. Story 7.12 / SEC-006: `criar_pedido` still trusts the
client-supplied `taxa_keepit_reais` instead of recalculating server-side).

**Why:** confirmed by [[project-bloco08-carteira]] — the mission text
enumerated exactly which ports/screens to wire and explicitly said "6
stories da carteira" with a fixed scope; writing a new migration would have
been scope creep into `@data-engineer` territory and outside `IDS`/agent
authority boundaries (`.claude/rules/agent-authority.md` — schema design
DDL is `@data-engineer`, not `@dev`).

**How to apply:** when a story's AC depends on backend work not yet applied
and it's outside your assigned mission scope:
1. Do NOT write the migration yourself, even if you technically could.
2. Do NOT mark the story `InReview` if the core AC is unmet — leave it at
   `InProgress` (or whatever accurately reflects partial completion) and
   document exactly which AC/task remains open and for whom.
3. Do complete whatever quality-gate/app-side task IS explicitly yours
   (e.g. re-running the existing test suite to confirm zero regression).
4. Surface the gap prominently in the final summary to the parent
   agent/user — don't bury it in a story file nobody reads before QA.
