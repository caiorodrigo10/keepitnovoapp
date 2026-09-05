-- Story 12.13 review fix — keep the audit lifecycle intact until the retention
-- policy explicitly decides how Auth deletion and audit retention interact.
ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT account_deletion_requests_user_id_fkey;

ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE RESTRICT;

-- Recovery is decided atomically by the database clock. A future due-row
-- claimant and this UPDATE serialize on the same row and re-evaluate status.
CREATE OR REPLACE FUNCTION public.cancel_account_deletion_request(p_user_id uuid)
RETURNS TABLE (
  status text,
  requested_at timestamptz,
  delete_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.account_deletion_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'scheduled'
    AND delete_at > now()
  RETURNING status, requested_at, delete_at;
$$;

REVOKE ALL ON FUNCTION public.cancel_account_deletion_request(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion_request(uuid)
  TO service_role;

COMMENT ON FUNCTION public.cancel_account_deletion_request(uuid) IS
  'Atomically cancels only the owning request while its seven-day recovery window remains open. Service-role only; caller identity must be derived from a validated JWT.';
