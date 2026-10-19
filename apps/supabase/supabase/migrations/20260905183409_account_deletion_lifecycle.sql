-- Story 12.13 — ciclo reversível de exclusão agendada.
-- O processador destrutivo/cron não é criado nesta migration: depende da
-- política de retenção aprovada, ainda ausente.

CREATE TABLE public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'scheduled'
    CONSTRAINT account_deletion_requests_status_check
    CHECK (status IN ('scheduled', 'cancelled', 'processing', 'completed', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT NOW(),
  delete_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  cancelled_at timestamptz,
  processing_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT account_deletion_requests_seven_day_window_check
    CHECK (delete_at = requested_at + INTERVAL '7 days')
);

CREATE UNIQUE INDEX account_deletion_requests_one_active_per_user_idx
  ON public.account_deletion_requests (user_id)
  WHERE status IN ('scheduled', 'processing');

CREATE INDEX account_deletion_requests_user_requested_idx
  ON public.account_deletion_requests (user_id, requested_at DESC);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.account_deletion_requests TO authenticated;
GRANT ALL ON TABLE public.account_deletion_requests TO service_role;

CREATE POLICY account_deletion_owner_select
  ON public.account_deletion_requests
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE public.account_deletion_requests IS
  'Reversible seven-day account deletion lifecycle. Destructive processing is intentionally not deployed until retention policy approval.';
COMMENT ON COLUMN public.account_deletion_requests.failure_code IS
  'Non-sensitive machine code only; never store credentials, JWTs or personal payloads.';

-- Rollback seguro (sempre em migration forward-only): remover primeiro a Edge
-- Function account-deletion e só então esta tabela. O rollback não toca Auth,
-- clientes nem qualquer dado funcional da conta.
