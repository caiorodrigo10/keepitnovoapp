---
name: project-orphan-branches-redundant
description: story/2.5.1|2.6|2.7 branches read NOT-CONTAINED by git ancestry but their work is already integrated — do not assume deletion loses work
metadata:
  type: project
---

After the 2026-08-26 worktree-stack integration into `feat/keepit-real-backend`
(HEAD 231eea9), branches `story/2.5.1-bootstrap-client`, `story/2.6-login-real`,
`story/2.7-password-recovery` all fail `git merge-base --is-ancestor <b> feat/keepit-real-backend`
(NOT-CONTAINED). They form a linear chain of orphan-hash commits
(25da602 → 78ee72e → 1891e77).

**Why:** the equivalent auth/session work was integrated via the block-04 chain
under *different commit hashes*, not by merging these branches. Files exist on the
integrated branch (AuthStack.tsx, useCurrentCliente.ts, authGuard.ts;
dataClientBootstrap tests green) and stories 2.5.1/2.6/2.7 are marked Done.

**How to apply:** if asked to clean these up, do NOT conclude "deletion loses work"
from the ancestry test alone, and do NOT `git branch -d` (it will refuse). Verify
file-level equivalence first, then `git branch -D` once confirmed redundant.
Relates to [[project_stack_worktrees_nao_integrada]] (now resolved — stack is
integrated).
