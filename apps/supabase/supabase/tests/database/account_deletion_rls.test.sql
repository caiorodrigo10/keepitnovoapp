-- Story 12.13 — prova transacional focada de prazo, unicidade e RLS.
BEGIN;

INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('13131313-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'story-12-13-a@example.invalid', '{}', '{"nome":"A"}', NOW(), NOW()),
  ('13131313-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'story-12-13-b@example.invalid', '{}', '{"nome":"B"}', NOW(), NOW());

INSERT INTO public.account_deletion_requests (user_id)
VALUES ('13131313-1111-4111-8111-111111111111');

DO $$
DECLARE item public.account_deletion_requests%ROWTYPE;
BEGIN
  SELECT * INTO item FROM public.account_deletion_requests
  WHERE user_id = '13131313-1111-4111-8111-111111111111';
  IF item.delete_at <> item.requested_at + INTERVAL '7 days' THEN
    RAISE EXCEPTION 'prazo precisa ser exatamente sete dias';
  END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.account_deletion_requests (user_id)
  VALUES ('13131313-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'duas solicitacoes ativas deveriam falhar';
EXCEPTION WHEN unique_violation THEN NULL;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '13131313-1111-4111-8111-111111111111', true);

DO $$
DECLARE visible_count bigint;
BEGIN
  SELECT count(*) INTO visible_count FROM public.account_deletion_requests;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'owner deveria ver uma linha, recebeu %', visible_count; END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.account_deletion_requests (user_id)
  VALUES ('13131313-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'authenticated não deveria inserir diretamente';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$$;

DO $$
BEGIN
  UPDATE public.account_deletion_requests SET status = 'cancelled';
  RAISE EXCEPTION 'authenticated não deveria atualizar diretamente';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '13131313-2222-4222-8222-222222222222', true);

DO $$
DECLARE visible_count bigint;
BEGIN
  SELECT count(*) INTO visible_count FROM public.account_deletion_requests;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'outro usuário viu % linha(s)', visible_count; END IF;
END;
$$;

ROLLBACK;
