-- Task 2 — resumable account-deletion scheduling, claims and leases.  This
-- migration deliberately does not enable the retention policy or delete data.

ALTER TABLE public.account_deletion_requests
  ALTER COLUMN user_id DROP NOT NULL;

CREATE TABLE private.account_deletion_executions (
  request_id uuid PRIMARY KEY
    REFERENCES public.account_deletion_requests(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL,
  policy_version text NOT NULL,
  phase text NOT NULL DEFAULT 'claimed'
    CHECK (phase IN ('claimed', 'cards_purged', 'data_purged', 'storage_purged', 'auth_deleted', 'completed')),
  lease_token uuid,
  lease_until timestamptz,
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  next_attempt_at timestamptz,
  failure_code text,
  has_cliente boolean NOT NULL,
  has_lojista boolean NOT NULL,
  scope jsonb NOT NULL DEFAULT '{"pedidoIds":[],"estabelecimentoIds":[],"cotacaoIds":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(scope) = 'object'
    AND jsonb_typeof(scope -> 'pedidoIds') = 'array'
    AND jsonb_typeof(scope -> 'estabelecimentoIds') = 'array'
    AND jsonb_typeof(scope -> 'cotacaoIds') = 'array')
);

ALTER TABLE private.account_deletion_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.account_deletion_executions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.account_deletion_executions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.account_deletion_executions TO service_role;

CREATE FUNCTION public.schedule_account_deletion_request(p_user_id uuid)
RETURNS SETOF public.account_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'USUARIO_INVALIDO'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-deletion:' || p_user_id::text, 0));
  SELECT * INTO v_request FROM public.account_deletion_requests
   WHERE user_id=p_user_id AND status IN ('scheduled','processing','failed')
   ORDER BY requested_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN NEXT v_request; RETURN; END IF;
  INSERT INTO public.account_deletion_requests(user_id) VALUES(p_user_id) RETURNING * INTO v_request;
  RETURN NEXT v_request;
END;
$$;

CREATE FUNCTION public.status_account_deletion_request(p_user_id uuid)
RETURNS TABLE(status text, requested_at timestamptz, delete_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT r.status,r.requested_at,r.delete_at FROM private.account_deletion_executions e
  JOIN public.account_deletion_requests r ON r.id=e.request_id
  WHERE e.target_user_id=p_user_id AND r.user_id IS NULL
  UNION ALL
  SELECT r.status,r.requested_at,r.delete_at FROM public.account_deletion_requests r
  WHERE r.user_id=p_user_id AND NOT EXISTS (SELECT 1 FROM private.account_deletion_executions e WHERE e.target_user_id=p_user_id)
  ORDER BY 2 DESC LIMIT 1;
END;
$$;

CREATE FUNCTION private.account_deletion_has_pending(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM public.pedidos p LEFT JOIN public.estabelecimentos e ON e.id=p.estabelecimento_id
   WHERE (p.cliente_id=p_user_id OR e.dono_user_id=p_user_id)
     AND p.status NOT IN ('entregue','cancelado','cancelado_timeout','cancelado_atraso','cancelado_admin','recusado','nao_retirado','nao_entregue_lojista','estornado_chargeback'))
 OR EXISTS (SELECT 1 FROM public.solicitacoes_pedido s WHERE s.solicitante_id=p_user_id AND s.estado='aberta')
 OR EXISTS (SELECT 1 FROM public.tentativas_pagamento t JOIN public.pedidos p ON p.id=t.pedido_id LEFT JOIN public.estabelecimentos e ON e.id=p.estabelecimento_id
   WHERE (t.cliente_id=p_user_id OR e.dono_user_id=p_user_id) AND t.estado IN ('criando','pendente','reconciliacao'))
 OR EXISTS (SELECT 1 FROM private.validacoes_cartoes v WHERE v.cliente_id=p_user_id AND v.estado IN ('validando','estorno_pendente','reconciliacao')
   AND NOT (v.estorno_confirmado AND v.valor_estornado_centavos=v.valor_centavos))
 OR EXISTS (SELECT 1 FROM public.repasses rp JOIN public.estabelecimentos e ON e.id=rp.estabelecimento_id
   WHERE e.dono_user_id=p_user_id AND rp.estado IN ('pendente','em_analise'));
$$;
REVOKE ALL ON FUNCTION private.account_deletion_has_pending(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.claim_account_deletions(p_limit integer)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v record; v_policy text; v_token uuid; v_generation bigint; v_cliente boolean; v_lojista boolean;
BEGIN
  p_limit:=coalesce(p_limit,10); IF p_limit<1 OR p_limit>20 THEN RAISE EXCEPTION 'LIMITE_INVALIDO'; END IF;
  SELECT versao INTO v_policy FROM private.politicas_retencao_cartoes WHERE escopo='cartoes_salvos' ORDER BY aprovada_em DESC LIMIT 1;
  PERFORM private.exigir_politica_retencao(v_policy);
  FOR v IN SELECT r.id,r.user_id,r.status FROM public.account_deletion_requests r LEFT JOIN private.account_deletion_executions e ON e.request_id=r.id
    WHERE r.user_id IS NOT NULL AND ((r.status='scheduled' AND r.delete_at<=now()) OR (r.status IN ('processing','failed') AND e.request_id IS NOT NULL AND (e.lease_until IS NULL OR e.lease_until<=now()) AND coalesce(e.next_attempt_at,'-infinity')<=now()))
    ORDER BY r.delete_at LIMIT p_limit LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('account-deletion:' || v.user_id::text,0));
    PERFORM 1 FROM public.account_deletion_requests WHERE id=v.id FOR UPDATE SKIP LOCKED; IF NOT FOUND THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.admin_users a WHERE a.id=v.user_id) THEN
      UPDATE public.account_deletion_requests SET failure_code='CONTA_ADMIN_FORA_ESCOPO',updated_at=now() WHERE id=v.id; CONTINUE;
    END IF;
    IF private.account_deletion_has_pending(v.user_id) THEN
      UPDATE public.account_deletion_requests SET failure_code='PENDENCIA_OPERACIONAL',updated_at=now() WHERE id=v.id; CONTINUE;
    END IF;
    v_cliente:=EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=v.user_id);
    v_lojista:=EXISTS(SELECT 1 FROM public.estabelecimentos e WHERE e.dono_user_id=v.user_id);
    v_token:=gen_random_uuid();
    INSERT INTO private.account_deletion_executions(request_id,target_user_id,policy_version,lease_token,lease_until,generation,next_attempt_at,has_cliente,has_lojista)
    VALUES(v.id,v.user_id,v_policy,v_token,now()+interval '120 seconds',1,NULL,v_cliente,v_lojista)
    ON CONFLICT(request_id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until,generation=private.account_deletion_executions.generation+1,next_attempt_at=NULL,updated_at=now()
      WHERE (private.account_deletion_executions.lease_until IS NULL OR private.account_deletion_executions.lease_until<=now())
        AND coalesce(private.account_deletion_executions.next_attempt_at,'-infinity')<=now()
    RETURNING generation INTO v_generation;
    IF v_generation IS NULL THEN CONTINUE; END IF;
    UPDATE public.account_deletion_requests SET status='processing',processing_at=coalesce(processing_at,now()),failure_code=NULL,updated_at=now() WHERE id=v.id;
    RETURN NEXT jsonb_build_object('id',v.id,'userId',v.user_id,'policyVersion',v_policy,'leaseToken',v_token,'generation',v_generation,'phase','claimed','hasCliente',v_cliente,'hasLojista',v_lojista);
  END LOOP;
END;
$$;

CREATE FUNCTION public.renew_account_deletion(
  p_request_id uuid,
  p_lease_token uuid,
  p_generation bigint
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE private.account_deletion_executions SET lease_until=now()+interval '120 seconds',updated_at=now()
  WHERE request_id=p_request_id AND lease_token=p_lease_token AND generation=p_generation AND lease_until>now()
  RETURNING true;
$$;

CREATE FUNCTION public.fail_account_deletion(
  p_request_id uuid,
  p_lease_token uuid,
  p_generation bigint,
  p_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_code IS NULL OR p_code NOT IN ('RETRYABLE_TEST','PURGA_CARTOES_FALHOU','PENDENCIA_OPERACIONAL') THEN RAISE EXCEPTION 'CODIGO_FALHA_INVALIDO'; END IF;
  UPDATE private.account_deletion_executions SET failure_code=p_code,next_attempt_at=now()+interval '15 minutes',lease_until=NULL,updated_at=now()
  WHERE request_id=p_request_id AND lease_token=p_lease_token AND generation=p_generation AND lease_until>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'LEASE_INVALIDA'; END IF;
  UPDATE public.account_deletion_requests SET status='processing',failure_code=p_code,failed_at=now(),updated_at=now() WHERE id=p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion_request(p_user_id uuid)
RETURNS TABLE(status text,requested_at timestamptz,delete_at timestamptz) LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-deletion:' || p_user_id::text,0));
 RETURN QUERY UPDATE public.account_deletion_requests AS r SET status='cancelled',cancelled_at=now(),updated_at=now()
  WHERE r.user_id=p_user_id AND r.status='scheduled' AND r.delete_at>now() RETURNING r.status,r.requested_at,r.delete_at;
END; $$;

REVOKE ALL ON FUNCTION public.schedule_account_deletion_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.status_account_deletion_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_account_deletions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_account_deletion(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_account_deletion(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_account_deletion_request(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.status_account_deletion_request(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_account_deletions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_account_deletion(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_account_deletion(uuid, uuid, bigint, text) TO service_role;
