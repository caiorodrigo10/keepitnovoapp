-- Task12: reconcile historical RPC definitions after the 23 reviewed migrations.

-- Accept only the complete remote or canonical hash vector; preserve the 46 true historical versions.

BEGIN;

DO $verify_before$
DECLARE
  remote_mismatches integer;
  canonical_mismatches integer;
  metadata_mismatches integer;
BEGIN
  WITH expected(schema_name, function_name, arguments, remote_md5, canonical_md5, expected_metadata) AS (
    VALUES
    ('private','aceitar_pedido','p_pedido_id uuid, p_tempo_estimado_min integer','b4ed675b42758766b5b0e11ebdafa8b4','8c23c4cdf8243f5dba72579cb24ec826','{"owner":"postgres","acl":"{postgres=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":false,"execute_authenticated":false,"execute_service_role":true}'::jsonb),
    ('private','confirmar_lancamento_admin','p_lancamento_id uuid, p_resultado text, p_detalhe text, p_asaas_id_externo text','13dec6b67bf1633c4d96c9f9e1372cca','b1827ae99c24276902f476f91b1053b9','{"owner":"postgres","acl":"{postgres=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":false,"execute_authenticated":false,"execute_service_role":true}'::jsonb),
    ('private','forcar_cancelamento_pedido','p_pedido_id uuid, p_motivo text','e4cce96d0c61cc8f4b6fdd61b2a71121','ed41276b6a12fc9fb4571aef67d5ee84','{"owner":"postgres","acl":"{postgres=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":false,"execute_authenticated":false,"execute_service_role":true}'::jsonb),
    ('private','recusar_pedido','p_pedido_id uuid, p_motivo text','db064e0bc55aa223946da2b4e088b432','5e5287f16151d7d6995318fabccabed9','{"owner":"postgres","acl":"{postgres=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":false,"execute_authenticated":false,"execute_service_role":true}'::jsonb),
    ('public','avancar_estado_pedido','p_pedido_id uuid, p_novo_status text','3218f50055f2da6ebc4bbec2bfd3a65b','5b8465e0af168dd67a019a60a7b397ac','{"owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":false,"execute_authenticated":true,"execute_service_role":true}'::jsonb),
    ('public','bloquear_cliente','p_cliente_id uuid, p_motivo text','84c051e06029b419fff0ed3c4679527e','229bc1c55970b1ea1039fd261adcabdd','{"owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":false,"execute_authenticated":true,"execute_service_role":true}'::jsonb),
    ('public','clientes_bloqueia_imutaveis','','62ce697f455a977a001637fdd46c4f10','ec1a0605733227cc15fe889edd31a64d','{"owner":"postgres","acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","security_definer":false,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":true,"execute_anon":true,"execute_authenticated":true,"execute_service_role":true}'::jsonb),
    ('public','criar_cliente_apos_signup','','dd375c388dbecc4b39fca51d3209e52c','c7a7040c331142cca67934ff204c2d97','{"owner":"postgres","acl":"{postgres=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=public, pg_temp"],"execute_public":false,"execute_anon":false,"execute_authenticated":false,"execute_service_role":true}'::jsonb),
    ('public','criar_estabelecimento_completo','p_nome_fantasia text, p_cnpj text, p_responsavel_nome text, p_telefone text, p_categoria text, p_endereco text, p_lat numeric, p_lng numeric, p_raio_atendimento_km numeric, p_tempo_medio_entrega_min integer, p_taxa_deslocamento_reais numeric, p_ticket_minimo_reais numeric, p_chave_pix text, p_chave_pix_tipo text, p_foto_fachada_url text, p_descricao text, p_horarios jsonb','389b8ade25f0eec23a1d205c3ff92f75','87b5652c3229a7df992f7b500e897207','{"owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=public, pg_temp"],"execute_public":false,"execute_anon":false,"execute_authenticated":true,"execute_service_role":true}'::jsonb),
    ('public','desbloquear_cliente','p_cliente_id uuid','8989cdfdf89ac5a52919eaa828999df1','c6999e361ee5aa26d9540e495d3aa837','{"owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":false,"execute_authenticated":true,"execute_service_role":true}'::jsonb),
    ('public','pode_ver_pedido','pedido_row pedidos','e6a777a3452618c3084a0a8605b2e546','eb4e7f75ef8efeaeef0909fa9378f393','{"owner":"postgres","acl":"{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"s","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":true,"execute_authenticated":true,"execute_service_role":true}'::jsonb),
    ('public','reativar_lojista','p_estabelecimento_id uuid','642df9a5ba14b724eaac8fde9fb4fd3b','096bb5e89ea5ad4bc86d7497dae59d35','{"owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":false,"execute_authenticated":true,"execute_service_role":true}'::jsonb),
    ('public','rejeitar_lojista','p_estab_id uuid, p_motivo text','8a92d4fc941550a852920984f4059d35','0f6c46ecc425181853c5a73d6712d0cb','{"owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":false,"execute_authenticated":true,"execute_service_role":true}'::jsonb),
    ('public','suspender_lojista','p_estabelecimento_id uuid, p_motivo text','078472143357eeefceb453f6492378c1','7d4ea4e92442f49cfe6d13371925ae59','{"owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","security_definer":true,"volatility":"v","strict":false,"leakproof":false,"parallel":"u","config":["search_path=\"\""],"execute_public":false,"execute_anon":false,"execute_authenticated":true,"execute_service_role":true}'::jsonb)
  )
  SELECT count(*) FILTER (WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid)) <> e.remote_md5),
         count(*) FILTER (WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid)) <> e.canonical_md5),
         count(*) FILTER (WHERE p.oid IS NULL OR jsonb_build_object(
           'owner', pg_get_userbyid(p.proowner),
           'acl', p.proacl::text,
           'security_definer', p.prosecdef,
           'volatility', p.provolatile,
           'strict', p.proisstrict,
           'leakproof', p.proleakproof,
           'parallel', p.proparallel,
           'config', to_jsonb(p.proconfig),
           'execute_public', has_function_privilege('public', p.oid, 'EXECUTE'),
           'execute_anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
           'execute_authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
           'execute_service_role', has_function_privilege('service_role', p.oid, 'EXECUTE')
         ) IS DISTINCT FROM e.expected_metadata)
    INTO remote_mismatches, canonical_mismatches, metadata_mismatches
    FROM expected e
    LEFT JOIN pg_namespace n ON n.nspname = e.schema_name
    LEFT JOIN pg_proc p ON p.pronamespace = n.oid
      AND p.proname = e.function_name
      AND pg_get_function_identity_arguments(p.oid) = e.arguments;

  -- Ownership, explicit ACL and effective EXECUTE, SECURITY DEFINER, search_path,
  -- and execution flags matched in both the remote clone and canonical local reset.
  -- Reject catalog drift before any CREATE OR REPLACE, including on a canonical rerun.
  IF metadata_mismatches <> 0 THEN
    RAISE EXCEPTION 'Task12 RPC metadata baseline mismatch (%)', metadata_mismatches;
  END IF;

  -- All 14 signatures must match one complete baseline. Mixed or drifted states fail closed.
  IF remote_mismatches <> 0 AND canonical_mismatches <> 0 THEN
    RAISE EXCEPTION 'Task12 RPC baseline mismatch (remote %, canonical %)',
      remote_mismatches, canonical_mismatches;
  END IF;
END
$verify_before$;

-- private.aceitar_pedido(p_pedido_id uuid, p_tempo_estimado_min integer)

CREATE OR REPLACE FUNCTION private.aceitar_pedido(p_pedido_id uuid, p_tempo_estimado_min integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_id   uuid;
BEGIN
  -- 1) Exige sessão autenticada (a função ignora RLS; validamos aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar aceitar_pedido';
  END IF;

  -- 2) tempo estimado tem de ser positivo.
  IF p_tempo_estimado_min IS NULL OR p_tempo_estimado_min <= 0 THEN
    RAISE EXCEPTION 'TEMPO_ESTIMADO_INVALIDO'
      USING HINT = 'Informe um tempo estimado em minutos maior que zero';
  END IF;

  -- 3) Transição idempotente-segura: só aceita 'aguardando_aceite' E só se o pedido
  --    for da loja do chamador (dono) OU o chamador for admin. Tudo na cláusula WHERE
  --    do UPDATE (autorização + estado juntos).
  UPDATE public.pedidos p
  SET status              = 'aceito',
      tempo_estimado_min  = p_tempo_estimado_min,
      aceito_em           = NOW()
  WHERE p.id = p_pedido_id
    AND p.status = 'aguardando_aceite'
    AND (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.estabelecimentos e
        WHERE e.id = p.estabelecimento_id
          AND e.dono_user_id = v_uid
      )
    )
  RETURNING p.id INTO v_id;

  -- 4) Nada atualizado: distinguir os 3 casos com mensagem honesta (sem sucesso
  --    silencioso). O chamador já foi validado como sessão; a distinção é legítima.
  IF v_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
      RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum pedido com o id informado';
    END IF;

    IF NOT (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.pedidos p
        JOIN public.estabelecimentos e ON e.id = p.estabelecimento_id
        WHERE p.id = p_pedido_id
          AND e.dono_user_id = v_uid
      )
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO'
        USING HINT = 'Apenas o lojista dono do pedido (ou um admin) pode aceitá-lo';
    END IF;

    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível aceitar um pedido em status aguardando_aceite';
  END IF;

  RETURN v_id;
END;
$function$;

-- private.confirmar_lancamento_admin(p_lancamento_id uuid, p_resultado text, p_detalhe text, p_asaas_id_externo text)

CREATE OR REPLACE FUNCTION private.confirmar_lancamento_admin(p_lancamento_id uuid, p_resultado text, p_detalhe text DEFAULT NULL::text, p_asaas_id_externo text DEFAULT NULL::text)
 RETURNS TABLE(lancamento_id uuid, tipo text, status text, ator_admin_id uuid, concluido_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_tipo   text;
  v_status text;
BEGIN
  -- 1) Sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão ausente ao chamar confirmar_lancamento_admin';
  END IF;

  -- 2) Só admin (lista plana — is_admin() autoriza tudo).
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO'
      USING HINT = 'Apenas administradores confirmam lançamentos financeiros';
  END IF;

  -- 3) Resultado válido.
  IF p_resultado IS NULL OR p_resultado NOT IN ('concluido', 'erro') THEN
    RAISE EXCEPTION 'RESULTADO_INVALIDO'
      USING HINT = 'p_resultado deve ser ''concluido'' ou ''erro''';
  END IF;

  -- 4) Trava a linha e lê o estado atual.
  SELECT l.tipo, l.status
    INTO v_tipo, v_status
  FROM public.lancamentos_financeiros l
  WHERE l.id = p_lancamento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LANCAMENTO_NAO_ENCONTRADO'
      USING HINT = 'Nenhum lançamento com o id informado';
  END IF;

  -- 5) Só refund (reembolso) ou payout (saque) são confirmáveis por esta fila.
  IF v_tipo NOT IN ('refund', 'payout') THEN
    RAISE EXCEPTION 'TIPO_INVALIDO'
      USING HINT = 'Só lançamentos refund (reembolso) ou payout (saque) podem ser confirmados';
  END IF;

  -- 6) Só transiciona a partir de 'pendente' (idempotência fechada).
  IF v_status <> 'pendente' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'O lançamento não está pendente (já concluido/erro)';
  END IF;

  -- 7) UPDATE só dos campos mutáveis (allow-list do trg_lancamento_imutavel).
  --    detalhe/asaas_id_externo: preserva o valor atual se o parâmetro vier NULL.
  UPDATE public.lancamentos_financeiros l
     SET status           = p_resultado,
         ator_admin_id    = v_uid,
         concluido_em     = NOW(),
         detalhe          = COALESCE(p_detalhe, l.detalhe),
         asaas_id_externo = COALESCE(p_asaas_id_externo, l.asaas_id_externo)
   WHERE l.id = p_lancamento_id
  RETURNING l.id, l.tipo, l.status, l.ator_admin_id, l.concluido_em
       INTO lancamento_id, tipo, status, ator_admin_id, concluido_em;

  RETURN NEXT;
END;
$function$;

-- private.forcar_cancelamento_pedido(p_pedido_id uuid, p_motivo text)

CREATE OR REPLACE FUNCTION private.forcar_cancelamento_pedido(p_pedido_id uuid, p_motivo text)
 RETURNS TABLE(pedido_id uuid, status text, refund_id uuid, refund_centavos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_estab    uuid;
  v_total    numeric(10,2);
  v_status   text;
  v_refund   uuid;
  v_cent     bigint;
BEGIN
  -- 1) Sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão ausente ao chamar forcar_cancelamento_pedido';
  END IF;

  -- 2) Só admin.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO'
      USING HINT = 'Apenas administradores forçam cancelamento de pedido';
  END IF;

  -- 3) Motivo obrigatório (server-side; TRIM evita string só de espaços).
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'
      USING HINT = 'Informe o motivo do cancelamento forçado';
  END IF;

  -- 4) Trava o pedido e lê estado/valores.
  SELECT p.estabelecimento_id, p.total_pago_reais, p.status
    INTO v_estab, v_total, v_status
  FROM public.pedidos p
  WHERE p.id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
      USING HINT = 'Nenhum pedido com o id informado';
  END IF;

  -- 5) Bloqueia estados terminais (evita double-refund; ver AUTO-DECISION no cabeçalho).
  IF v_status IN (
    'entregue', 'cancelado', 'cancelado_timeout', 'cancelado_atraso', 'cancelado_admin',
    'recusado', 'nao_retirado', 'nao_entregue_lojista', 'estornado_chargeback'
  ) THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Pedido em estado terminal não pode ser cancelado à força';
  END IF;

  -- 6) Reembolso total (100%) em centavos, NEGATIVO (convenção do ledger).
  v_cent := -(ROUND(COALESCE(v_total, 0) * 100))::bigint;

  -- 7) Transiciona o pedido → 'cancelado_admin' + motivo + cancelado_em.
  UPDATE public.pedidos p
     SET status              = 'cancelado_admin',
         motivo_cancelamento = p_motivo,
         cancelado_em        = NOW()
   WHERE p.id = p_pedido_id;

  -- 8) INSERT do refund 100% pendente (mesma transação). Vai à fila da 8.1; o admin o
  --    confirma depois via confirmar_lancamento_admin (8.2). disponivel_em=NULL (imediato).
  INSERT INTO public.lancamentos_financeiros (
    estabelecimento_id, pedido_id, tipo, valor_centavos, status, ator_admin_id,
    disponivel_em, detalhe
  )
  VALUES (
    v_estab, p_pedido_id, 'refund', v_cent, 'pendente', v_uid,
    NULL, 'Reembolso total (100%) por cancelamento forçado do admin. Motivo: ' || p_motivo
  )
  RETURNING id INTO v_refund;

  RETURN QUERY SELECT p_pedido_id, 'cancelado_admin'::text, v_refund, v_cent;
END;
$function$;

-- private.recusar_pedido(p_pedido_id uuid, p_motivo text)

CREATE OR REPLACE FUNCTION private.recusar_pedido(p_pedido_id uuid, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_estab uuid;
  v_total numeric(10,2);
  v_cent  bigint;
BEGIN
  -- 1) Exige sessão autenticada (a função ignora RLS; validamos aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar recusar_pedido';
  END IF;

  -- 2) Motivo obrigatório (server-side; TRIM evita string só de espaços).
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'
      USING HINT = 'Informe o motivo da recusa';
  END IF;

  -- 3) Transição idempotente-segura: só recusa 'aguardando_aceite' E só se o
  --    pedido for da loja do chamador (dono) OU o chamador for admin. Ownership +
  --    estado juntos no WHERE do UPDATE — mesmo padrão de aceitar_pedido.
  UPDATE public.pedidos p
  SET status        = 'recusado',
      motivo_recusa = p_motivo
  WHERE p.id = p_pedido_id
    AND p.status = 'aguardando_aceite'
    AND (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.estabelecimentos e
        WHERE e.id = p.estabelecimento_id
          AND e.dono_user_id = v_uid
      )
    )
  RETURNING p.id, p.estabelecimento_id, p.total_pago_reais INTO v_id, v_estab, v_total;

  -- 4) Nada atualizado: distinguir os 3 casos com mensagem honesta (sem sucesso
  --    silencioso) — mesmo padrão de aceitar_pedido.
  IF v_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
      RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum pedido com o id informado';
    END IF;

    IF NOT (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.pedidos p
        JOIN public.estabelecimentos e ON e.id = p.estabelecimento_id
        WHERE p.id = p_pedido_id
          AND e.dono_user_id = v_uid
      )
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO'
        USING HINT = 'Apenas o lojista dono do pedido (ou um admin) pode recusá-lo';
    END IF;

    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível recusar um pedido em status aguardando_aceite';
  END IF;

  -- 5) Reembolso total (100%) em centavos, NEGATIVO (convenção do ledger),
  --    mesma transação implícita do UPDATE acima.
  v_cent := -(ROUND(COALESCE(v_total, 0) * 100))::bigint;

  INSERT INTO public.lancamentos_financeiros (
    estabelecimento_id, pedido_id, tipo, valor_centavos, status, disponivel_em, detalhe
  )
  VALUES (
    v_estab, p_pedido_id, 'refund', v_cent, 'pendente', NULL,
    'Reembolso total (100%) por recusa do lojista. Motivo: ' || p_motivo
  );

  RETURN v_id;
END;
$function$;

-- public.avancar_estado_pedido(p_pedido_id uuid, p_novo_status text)

CREATE OR REPLACE FUNCTION public.avancar_estado_pedido(p_pedido_id uuid, p_novo_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_new  text;
BEGIN
  -- 1) Exige sessão autenticada (a função ignora RLS; validamos aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar avancar_estado_pedido';
  END IF;

  -- 2) Alvo tem de estar no conjunto de estados operacionais que ESTA RPC pode produzir.
  --    'entregue' e estados de cancelamento/recusa/timeout NÃO entram aqui (barra cedo,
  --    antes de tocar a tabela). 'entregue' é exclusivo de confirmar_pin_pedido.
  IF p_novo_status IS NULL
     OR p_novo_status NOT IN ('em_preparo', 'saindo_hub', 'no_hub') THEN
    RAISE EXCEPTION 'TRANSICAO_INVALIDA'
      USING HINT = 'Alvo permitido: em_preparo, saindo_hub ou no_hub '
                   '(entregue é exclusivo da confirmação de PIN; cancelamentos fora do bloco)';
  END IF;

  -- 3) Transição atômica: origem esperada (por alvo) + ownership/admin + alvo, tudo na
  --    cláusula WHERE de UM único UPDATE. Grava saiu_hub_em só quando o alvo é saindo_hub.
  UPDATE public.pedidos p
  SET status      = p_novo_status,
      saiu_hub_em = CASE WHEN p_novo_status = 'saindo_hub' THEN NOW() ELSE p.saiu_hub_em END
  WHERE p.id = p_pedido_id
    AND (
      (p_novo_status = 'em_preparo' AND p.status = 'aceito')
      OR (p_novo_status = 'saindo_hub' AND p.status IN ('aceito', 'em_preparo'))
      OR (p_novo_status = 'no_hub'    AND p.status = 'saindo_hub')
    )
    AND (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.estabelecimentos e
        WHERE e.id = p.estabelecimento_id
          AND e.dono_user_id = v_uid
      )
    )
  RETURNING p.status INTO v_new;

  -- 4) UPDATE vazio: distinguir os 3 casos com mensagem honesta.
  IF v_new IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = p_pedido_id) THEN
      RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum pedido com o id informado';
    END IF;

    IF NOT (
      public.is_admin(v_uid)
      OR EXISTS (
        SELECT 1 FROM public.pedidos p
        JOIN public.estabelecimentos e ON e.id = p.estabelecimento_id
        WHERE p.id = p_pedido_id
          AND e.dono_user_id = v_uid
      )
    ) THEN
      RAISE EXCEPTION 'ACESSO_NEGADO'
        USING HINT = 'Apenas o lojista dono do pedido (ou um admin) pode avançar o estado';
    END IF;

    -- É do lojista, alvo válido, mas a origem não permite a transição pedida.
    RAISE EXCEPTION 'TRANSICAO_INVALIDA'
      USING HINT = 'O estado atual do pedido não permite avançar para o alvo informado';
  END IF;

  RETURN v_new;
END;
$function$;

-- public.bloquear_cliente(p_cliente_id uuid, p_motivo text)

CREATE OR REPLACE FUNCTION public.bloquear_cliente(p_cliente_id uuid, p_motivo text)
 RETURNS TABLE(cliente_id uuid, bloqueado boolean, bloqueado_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA' USING HINT = 'Sessão ausente';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING HINT = 'Apenas administradores bloqueiam clientes';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO' USING HINT = 'Informe o motivo do bloqueio';
  END IF;

  UPDATE public.clientes c
     SET bloqueado       = true,
         motivo_bloqueio = p_motivo,
         bloqueado_em    = NOW()
   WHERE c.id = p_cliente_id
  RETURNING c.id, c.bloqueado, c.bloqueado_em
       INTO cliente_id, bloqueado, bloqueado_em;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO' USING HINT = 'Nenhum cliente com o id informado';
  END IF;

  RETURN NEXT;
END;
$function$;

-- public.clientes_bloqueia_imutaveis()

CREATE OR REPLACE FUNCTION public.clientes_bloqueia_imutaveis()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.bloqueado       IS DISTINCT FROM OLD.bloqueado
       OR NEW.motivo_bloqueio IS DISTINCT FROM OLD.motivo_bloqueio
       OR NEW.bloqueado_em  IS DISTINCT FROM OLD.bloqueado_em THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: bloqueado/motivo_bloqueio/bloqueado_em só mudam por RPC admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- public.criar_cliente_apos_signup()

CREATE OR REPLACE FUNCTION public.criar_cliente_apos_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Signup de lojista (Épico 3): não espelhar em `clientes`. A identidade do
  -- lojista vive só em auth.users nesta fatia; seu domínio (`estabelecimentos`)
  -- é escrito pelas Stories 3.4/3.5, não por trigger.
  IF NEW.raw_user_meta_data->>'role' = 'lojista' THEN
    RETURN NEW;
  END IF;

  -- Signup de cliente (Stories 2.3/2.6) — 'role' ausente cai aqui (default).
  -- Contrato normativo de raw_user_meta_data (Story 2.3, FIXADO):
  --   'nome'     : string não vazia  → clientes.nome
  --   'telefone' : string ou ausente → clientes.telefone (vazio vira NULL)
  INSERT INTO public.clientes (id, nome, telefone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    NULLIF(NEW.raw_user_meta_data->>'telefone', '')  -- ausente/vazio vira NULL
  );
  RETURN NEW;
END;
$function$;

-- public.criar_estabelecimento_completo(p_nome_fantasia text, p_cnpj text, p_responsavel_nome text, p_telefone text, p_categoria text, p_endereco text, p_lat numeric, p_lng numeric, p_raio_atendimento_km numeric, p_tempo_medio_entrega_min integer, p_taxa_deslocamento_reais numeric, p_ticket_minimo_reais numeric, p_chave_pix text, p_chave_pix_tipo text, p_foto_fachada_url text, p_descricao text, p_horarios jsonb)

CREATE OR REPLACE FUNCTION public.criar_estabelecimento_completo(p_nome_fantasia text, p_cnpj text, p_responsavel_nome text, p_telefone text, p_categoria text, p_endereco text, p_lat numeric, p_lng numeric, p_raio_atendimento_km numeric, p_tempo_medio_entrega_min integer, p_taxa_deslocamento_reais numeric, p_ticket_minimo_reais numeric, p_chave_pix text, p_chave_pix_tipo text, p_foto_fachada_url text, p_descricao text, p_horarios jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_estab_id  uuid;
  v_dia       jsonb;
BEGIN
  -- 1) Defesa: exige sessão autenticada (a função ignora RLS, então validamos aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar criar_estabelecimento_completo';
  END IF;

  -- 2) Defesa: exatamente 7 dias de horário (0..6). A PK e o CHECK do §1.5
  --    validam faixa/duplicidade/consistência; aqui garantimos a completude.
  IF p_horarios IS NULL OR jsonb_typeof(p_horarios) <> 'array'
     OR jsonb_array_length(p_horarios) <> 7 THEN
    RAISE EXCEPTION 'HORARIOS_INVALIDOS'
      USING HINT = 'Esperado um array JSON com exatamente 7 dias (dia_semana 0..6)';
  END IF;

  -- 3) UPSERT idempotente do estabelecimento por dono_user_id.
  --    status = 'em_analise' fixo; dono_user_id = auth.uid() (nunca vem de fora);
  --    asaas_wallet_id fica NULL (conta Asaas única do piloto).
  INSERT INTO public.estabelecimentos (
    dono_user_id, nome_fantasia, cnpj, responsavel_nome, telefone, categoria,
    descricao, foto_fachada_url, endereco, lat, lng, raio_atendimento_km,
    tempo_medio_entrega_min, taxa_deslocamento_reais, ticket_minimo_reais,
    chave_pix, chave_pix_tipo, status
  )
  VALUES (
    v_uid, p_nome_fantasia, p_cnpj, p_responsavel_nome, p_telefone, p_categoria,
    p_descricao, p_foto_fachada_url, p_endereco, p_lat, p_lng, p_raio_atendimento_km,
    p_tempo_medio_entrega_min, COALESCE(p_taxa_deslocamento_reais, 0), p_ticket_minimo_reais,
    p_chave_pix, p_chave_pix_tipo, 'em_analise'
  )
  ON CONFLICT (dono_user_id) DO UPDATE SET
    nome_fantasia           = EXCLUDED.nome_fantasia,
    cnpj                    = EXCLUDED.cnpj,
    responsavel_nome        = EXCLUDED.responsavel_nome,
    telefone                = EXCLUDED.telefone,
    categoria               = EXCLUDED.categoria,
    descricao               = EXCLUDED.descricao,
    foto_fachada_url        = EXCLUDED.foto_fachada_url,
    endereco                = EXCLUDED.endereco,
    lat                     = EXCLUDED.lat,
    lng                     = EXCLUDED.lng,
    raio_atendimento_km     = EXCLUDED.raio_atendimento_km,
    tempo_medio_entrega_min = EXCLUDED.tempo_medio_entrega_min,
    taxa_deslocamento_reais = EXCLUDED.taxa_deslocamento_reais,
    ticket_minimo_reais     = EXCLUDED.ticket_minimo_reais,
    chave_pix               = EXCLUDED.chave_pix,
    chave_pix_tipo          = EXCLUDED.chave_pix_tipo
    -- NÃO tocamos status / asaas_wallet_id / aprovado_* aqui (imutáveis por este caminho).
  WHERE estabelecimentos.status = 'em_analise'   -- só recupera reenvio ainda em análise
  RETURNING id INTO v_estab_id;

  -- 4) Se o UPSERT não retornou id, existe uma linha do mesmo dono que NÃO está
  --    mais 'em_analise' (já aprovada/rejeitada/suspensa). Mensagem honesta (AC4).
  IF v_estab_id IS NULL THEN
    RAISE EXCEPTION 'CADASTRO_JA_PROCESSADO'
      USING HINT = 'Já existe um cadastro deste lojista fora do estado em_analise';
  END IF;

  -- 5) Upsert das 7 linhas de horário (completa faltantes / atualiza presentes).
  --    Idempotente por (estabelecimento_id, dia_semana). O CHECK do §1.5 valida
  --    a consistência aberto/horas — se inconsistente, RAISE → rollback total.
  FOR v_dia IN SELECT jsonb_array_elements(p_horarios)
  LOOP
    INSERT INTO public.estabelecimentos_horarios (
      estabelecimento_id, dia_semana, aberto, hora_abre, hora_fecha
    )
    VALUES (
      v_estab_id,
      (v_dia->>'dia_semana')::smallint,
      COALESCE((v_dia->>'aberto')::boolean, false),
      NULLIF(v_dia->>'hora_abre', '')::time,
      NULLIF(v_dia->>'hora_fecha', '')::time
    )
    ON CONFLICT (estabelecimento_id, dia_semana) DO UPDATE SET
      aberto     = EXCLUDED.aberto,
      hora_abre  = EXCLUDED.hora_abre,
      hora_fecha = EXCLUDED.hora_fecha;
  END LOOP;

  RETURN v_estab_id;

EXCEPTION
  -- CNPJ que colide com estabelecimento de OUTRO dono (o conflito do próprio dono
  -- já foi absorvido pelo ON CONFLICT acima). Mensagem honesta, sem vazar dono.
  WHEN unique_violation THEN
    RAISE EXCEPTION 'CNPJ_DUPLICADO'
      USING HINT = 'CNPJ já cadastrado em outro estabelecimento';
END;
$function$;

-- public.desbloquear_cliente(p_cliente_id uuid)

CREATE OR REPLACE FUNCTION public.desbloquear_cliente(p_cliente_id uuid)
 RETURNS TABLE(cliente_id uuid, bloqueado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA' USING HINT = 'Sessão ausente';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING HINT = 'Apenas administradores desbloqueiam clientes';
  END IF;

  UPDATE public.clientes c
     SET bloqueado       = false,
         motivo_bloqueio = NULL,
         bloqueado_em    = NULL
   WHERE c.id = p_cliente_id
  RETURNING c.id, c.bloqueado
       INTO cliente_id, bloqueado;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO' USING HINT = 'Nenhum cliente com o id informado';
  END IF;

  RETURN NEXT;
END;
$function$;

-- public.pode_ver_pedido(pedido_row pedidos)

CREATE OR REPLACE FUNCTION public.pode_ver_pedido(pedido_row pedidos)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    public.is_admin()
    OR pedido_row.cliente_id = auth.uid()
    OR pedido_row.estabelecimento_id = public.meu_estabelecimento_id();
$function$;

-- public.reativar_lojista(p_estabelecimento_id uuid)

CREATE OR REPLACE FUNCTION public.reativar_lojista(p_estabelecimento_id uuid)
 RETURNS TABLE(estabelecimento_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA' USING HINT = 'Sessão ausente';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING HINT = 'Apenas administradores reativam lojistas';
  END IF;

  SELECT e.status INTO v_status
  FROM public.estabelecimentos e
  WHERE e.id = p_estabelecimento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESTABELECIMENTO_NAO_ENCONTRADO' USING HINT = 'Nenhum estabelecimento com o id informado';
  END IF;
  IF v_status <> 'suspenso' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO' USING HINT = 'Só um lojista suspenso pode ser reativado';
  END IF;

  UPDATE public.estabelecimentos e
     SET status           = 'ativo',
         motivo_suspensao = NULL,
         suspenso_em      = NULL
   WHERE e.id = p_estabelecimento_id
  RETURNING e.id, e.status
       INTO estabelecimento_id, status;

  RETURN NEXT;
END;
$function$;

-- public.rejeitar_lojista(p_estab_id uuid, p_motivo text)

CREATE OR REPLACE FUNCTION public.rejeitar_lojista(p_estab_id uuid, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_estab_id  uuid;
  v_motivo    text := btrim(COALESCE(p_motivo, ''));   -- trim; preserva formatação interna
BEGIN
  -- 1) Exige sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de admin ausente ao chamar rejeitar_lojista';
  END IF;

  -- 2) Autorização: só admin.
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO'
      USING HINT = 'Apenas um admin (is_admin) pode rejeitar um lojista';
  END IF;

  -- 3) Motivo obrigatório — validado server-side (não confia no client). AC2.
  IF v_motivo = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'
      USING HINT = 'O motivo da rejeição é obrigatório (não pode ser vazio ou só espaços)';
  END IF;

  -- 4) Transição de estado: só rejeita quem está 'em_analise'. Grava o motivo íntegro.
  UPDATE public.estabelecimentos
  SET status          = 'rejeitado',
      motivo_rejeicao = v_motivo
  WHERE id = p_estab_id
    AND status = 'em_analise'
  RETURNING id INTO v_estab_id;

  -- 5) Nada atualizado: não existe ou não está em_analise. Erro honesto (AC3).
  IF v_estab_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.estabelecimentos WHERE id = p_estab_id) THEN
      RAISE EXCEPTION 'ESTABELECIMENTO_NAO_ENCONTRADO'
        USING HINT = 'Nenhum estabelecimento com o id informado';
    END IF;
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível rejeitar um lojista em status em_analise';
  END IF;

  RETURN v_estab_id;
END;
$function$;

-- public.suspender_lojista(p_estabelecimento_id uuid, p_motivo text)

CREATE OR REPLACE FUNCTION public.suspender_lojista(p_estabelecimento_id uuid, p_motivo text)
 RETURNS TABLE(estabelecimento_id uuid, status text, suspenso_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA' USING HINT = 'Sessão ausente';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING HINT = 'Apenas administradores suspendem lojistas';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO' USING HINT = 'Informe o motivo da suspensão';
  END IF;

  SELECT e.status INTO v_status
  FROM public.estabelecimentos e
  WHERE e.id = p_estabelecimento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESTABELECIMENTO_NAO_ENCONTRADO' USING HINT = 'Nenhum estabelecimento com o id informado';
  END IF;
  IF v_status <> 'ativo' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO' USING HINT = 'Só um lojista ativo pode ser suspenso';
  END IF;

  UPDATE public.estabelecimentos e
     SET status           = 'suspenso',
         motivo_suspensao = p_motivo,
         suspenso_em      = NOW()
   WHERE e.id = p_estabelecimento_id
  RETURNING e.id, e.status, e.suspenso_em
       INTO estabelecimento_id, status, suspenso_em;

  RETURN NEXT;
END;
$function$;

DO $verify_after$
DECLARE mismatches text;
BEGIN
  SELECT string_agg(e.schema_name || '.' || e.function_name || '(' || e.arguments || ')', ', ' ORDER BY e.schema_name, e.function_name)
    INTO mismatches
    FROM (VALUES
    ('private','aceitar_pedido','p_pedido_id uuid, p_tempo_estimado_min integer','8c23c4cdf8243f5dba72579cb24ec826'),
    ('private','confirmar_lancamento_admin','p_lancamento_id uuid, p_resultado text, p_detalhe text, p_asaas_id_externo text','b1827ae99c24276902f476f91b1053b9'),
    ('private','forcar_cancelamento_pedido','p_pedido_id uuid, p_motivo text','ed41276b6a12fc9fb4571aef67d5ee84'),
    ('private','recusar_pedido','p_pedido_id uuid, p_motivo text','5e5287f16151d7d6995318fabccabed9'),
    ('public','avancar_estado_pedido','p_pedido_id uuid, p_novo_status text','5b8465e0af168dd67a019a60a7b397ac'),
    ('public','bloquear_cliente','p_cliente_id uuid, p_motivo text','229bc1c55970b1ea1039fd261adcabdd'),
    ('public','clientes_bloqueia_imutaveis','','ec1a0605733227cc15fe889edd31a64d'),
    ('public','criar_cliente_apos_signup','','c7a7040c331142cca67934ff204c2d97'),
    ('public','criar_estabelecimento_completo','p_nome_fantasia text, p_cnpj text, p_responsavel_nome text, p_telefone text, p_categoria text, p_endereco text, p_lat numeric, p_lng numeric, p_raio_atendimento_km numeric, p_tempo_medio_entrega_min integer, p_taxa_deslocamento_reais numeric, p_ticket_minimo_reais numeric, p_chave_pix text, p_chave_pix_tipo text, p_foto_fachada_url text, p_descricao text, p_horarios jsonb','87b5652c3229a7df992f7b500e897207'),
    ('public','desbloquear_cliente','p_cliente_id uuid','c6999e361ee5aa26d9540e495d3aa837'),
    ('public','pode_ver_pedido','pedido_row pedidos','eb4e7f75ef8efeaeef0909fa9378f393'),
    ('public','reativar_lojista','p_estabelecimento_id uuid','096bb5e89ea5ad4bc86d7497dae59d35'),
    ('public','rejeitar_lojista','p_estab_id uuid, p_motivo text','0f6c46ecc425181853c5a73d6712d0cb'),
    ('public','suspender_lojista','p_estabelecimento_id uuid, p_motivo text','7d4ea4e92442f49cfe6d13371925ae59')
    ) AS e(schema_name, function_name, arguments, expected_md5)
    LEFT JOIN pg_namespace n ON n.nspname = e.schema_name
    LEFT JOIN pg_proc p ON p.pronamespace = n.oid
      AND p.proname = e.function_name
      AND pg_get_function_identity_arguments(p.oid) = e.arguments
   WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid)) <> e.expected_md5;
  IF mismatches IS NOT NULL THEN
    RAISE EXCEPTION 'Task12 reconciliation verify_after mismatch: %', mismatches;
  END IF;
END
$verify_after$;

COMMIT;
