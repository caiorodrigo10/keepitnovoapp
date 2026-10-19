---
name: project-rls-immutability-gotcha
description: Keepit architecture RLS policies (05-security.md §3.4/§3.5) that guard column immutability with a subquery on the policy's own table are unenforceable in Postgres
metadata:
  type: project
---

The Keepit architecture doc `docs/architecture/05-security.md` writes column-immutability
guards inside RLS `WITH CHECK` using a subquery on the policy's OWN table, e.g.
`status = (SELECT status FROM estabelecimentos WHERE id = estabelecimentos.id)`.

Two defects, both confirmed against real Postgres 15:
1. **Infinite recursion**: any RLS policy that queries its own table raises
   `infinite recursion detected in policy for relation "..."` at runtime. Not fixable
   by aliasing.
2. **Shadowing bug in the literal text**: inside `FROM estabelecimentos`, the name
   `estabelecimentos.id` binds to the subquery's own FROM → `id = id` always true →
   "more than one row returned by subquery".

**Why:** discovered validating Story 3.5 migrations (`estabelecimentos`) — the
`lojista_atualiza_proprio` UPDATE policy failed under the `authenticated` role.

**How to apply:** for "lojista can update operational fields but NOT status/cnpj/
asaas_wallet_id/dono_user_id", split the concern:
- RLS UPDATE policy = ownership only: `USING/WITH CHECK (dono_user_id = (SELECT auth.uid()))`.
- Column immutability = a `BEFORE UPDATE` trigger that raises when a protected column
  changed AND `current_user IN ('authenticated','anon')` (so privileged paths —
  SECURITY DEFINER RPCs running as owner, service_role, the admin flow — are NOT blocked
  and can still legitimately change `status`).

This same anti-pattern recurs across the doc (any table needing "column X is immutable
by the app role"). Apply the ownership-RLS + trigger split there too, and recommend the
architecture doc §3.4/§3.5 be updated. See migration
`20260812123046_criar_estabelecimentos.sql` for the reference implementation.

Related: `admin_users`/`is_admin()` do not exist until Story 3.7; policies that need
`OR is_admin()` are shipped without it (fail-closed) and flagged as a TODO for 3.7 —
this is the project's established "débito de sequenciamento" pattern (see also the
Story 2.3 `clientes` migration).
