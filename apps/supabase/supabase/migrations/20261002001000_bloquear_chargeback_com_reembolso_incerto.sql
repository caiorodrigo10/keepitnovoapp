BEGIN;

CREATE OR REPLACE FUNCTION public.resolver_chargeback_admin(
  p_ocorrencia_id uuid,
  p_responsavel_principal text,
  p_motivo text,
  p_referencia text,
  p_principal_centavos bigint,
  p_operacao_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motivo text := btrim(p_motivo);
  v_referencia text := btrim(p_referencia);
  v_ocorrencia public.ocorrencias_pagamento%ROWTYPE;
  v_pedido public.pedidos%ROWTYPE;
  v_decisao public.decisoes_chargeback%ROWTYPE;
  v_credito_centavos bigint;
  v_reembolsado_centavos bigint;
  v_chargeback_anterior_centavos bigint;
  v_credito_efetivo_centavos bigint;
  v_principal_debitado_centavos bigint;
  v_lancamento_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;
  IF p_operacao_id IS NULL THEN RAISE EXCEPTION 'OPERACAO_ID_OBRIGATORIO'; END IF;
  IF p_ocorrencia_id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_OBRIGATORIA'; END IF;
  IF p_responsavel_principal IS NULL OR p_responsavel_principal NOT IN ('keepit','lojista') THEN
    RAISE EXCEPTION 'RESPONSAVEL_INVALIDO';
  END IF;
  IF p_motivo IS NULL OR v_motivo = '' OR length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'MOTIVO_INVALIDO';
  END IF;
  IF p_referencia IS NULL OR v_referencia = '' OR length(v_referencia) > 256 THEN
    RAISE EXCEPTION 'REFERENCIA_INVALIDA';
  END IF;
  IF p_principal_centavos IS NULL OR p_principal_centavos < 0 THEN
    RAISE EXCEPTION 'PRINCIPAL_INVALIDO';
  END IF;

  SELECT * INTO v_decisao
  FROM public.decisoes_chargeback
  WHERE operacao_id = p_operacao_id;
  IF FOUND THEN
    IF v_decisao.ocorrencia_id IS DISTINCT FROM p_ocorrencia_id
      OR v_decisao.responsavel_principal IS DISTINCT FROM p_responsavel_principal
      OR v_decisao.motivo IS DISTINCT FROM v_motivo
      OR v_decisao.referencia IS DISTINCT FROM v_referencia
      OR v_decisao.principal_informado_centavos IS DISTINCT FROM p_principal_centavos THEN
      RAISE EXCEPTION 'OPERACAO_ID_EM_USO';
    END IF;
    RETURN jsonb_build_object(
      'id',v_decisao.id,'ocorrenciaId',v_decisao.ocorrencia_id,
      'responsavelPrincipal',v_decisao.responsavel_principal,
      'motivo',v_decisao.motivo,'referencia',v_decisao.referencia,
      'principalInformadoCentavos',v_decisao.principal_informado_centavos,
      'principalDebitadoCentavos',v_decisao.principal_debitado_centavos,
      'taxaCentavos',v_decisao.taxa_centavos,'lancamentoId',v_decisao.lancamento_id,
      'criadoEm',v_decisao.criado_em
    );
  END IF;

  SELECT * INTO v_ocorrencia
  FROM public.ocorrencias_pagamento
  WHERE id = p_ocorrencia_id
  FOR UPDATE;
  IF NOT FOUND OR v_ocorrencia.tipo <> 'chargeback' THEN
    RAISE EXCEPTION 'CHARGEBACK_NAO_ENCONTRADO';
  END IF;

  SELECT * INTO v_decisao
  FROM public.decisoes_chargeback
  WHERE ocorrencia_id = p_ocorrencia_id;
  IF FOUND THEN
    IF v_decisao.operacao_id = p_operacao_id
      AND v_decisao.responsavel_principal = p_responsavel_principal
      AND v_decisao.motivo = v_motivo
      AND v_decisao.referencia = v_referencia
      AND v_decisao.principal_informado_centavos = p_principal_centavos THEN
      RETURN jsonb_build_object(
        'id',v_decisao.id,'ocorrenciaId',v_decisao.ocorrencia_id,
        'responsavelPrincipal',v_decisao.responsavel_principal,
        'motivo',v_decisao.motivo,'referencia',v_decisao.referencia,
        'principalInformadoCentavos',v_decisao.principal_informado_centavos,
        'principalDebitadoCentavos',v_decisao.principal_debitado_centavos,
        'taxaCentavos',v_decisao.taxa_centavos,'lancamentoId',v_decisao.lancamento_id,
        'criadoEm',v_decisao.criado_em
      );
    END IF;
    RAISE EXCEPTION 'OCORRENCIA_JA_DECIDIDA';
  END IF;
  IF v_ocorrencia.estado = 'encerrada' THEN RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;

  SELECT * INTO STRICT v_pedido
  FROM public.pedidos
  WHERE id = v_ocorrencia.pedido_id
  FOR UPDATE;

  -- A mesma trava de pedido é adquirida por toda conciliação de reembolso.
  -- Enquanto o gateway ainda pode confirmar um estorno de responsabilidade do
  -- lojista, o principal disponível é incerto e a decisão deve aguardar.
  IF EXISTS (
    SELECT 1
    FROM public.lancamentos_financeiros
    WHERE pedido_id = v_pedido.id
      AND tipo = 'refund'
      AND responsavel_reembolso = 'lojista'
      AND status IN ('pendente','erro')
      AND estado_reserva = 'ativa'
  ) THEN
    RAISE EXCEPTION 'REEMBOLSO_LOJISTA_REQUER_CONCILIACAO';
  END IF;

  SELECT COALESCE(sum(valor_centavos),0) INTO v_credito_centavos
  FROM public.lancamentos_financeiros
  WHERE pedido_id = v_pedido.id
    AND tipo = 'merchant_credit'
    AND valor_centavos > 0
    AND status = 'concluido';

  SELECT COALESCE(sum(-valor_centavos),0) INTO v_reembolsado_centavos
  FROM public.lancamentos_financeiros
  WHERE pedido_id = v_pedido.id
    AND tipo = 'merchant_credit'
    AND valor_centavos < 0
    AND status = 'concluido'
    AND reembolso_origem_id IS NOT NULL;

  SELECT COALESCE(sum(principal_debitado_centavos),0) INTO v_chargeback_anterior_centavos
  FROM public.decisoes_chargeback
  WHERE pedido_id = v_pedido.id;

  v_credito_efetivo_centavos := GREATEST(
    0,
    v_credito_centavos - v_reembolsado_centavos - v_chargeback_anterior_centavos
  );
  v_principal_debitado_centavos := CASE
    WHEN p_responsavel_principal = 'lojista'
      THEN LEAST(p_principal_centavos, v_credito_efetivo_centavos)
    ELSE 0
  END;

  INSERT INTO public.lancamentos_financeiros(
    estabelecimento_id,pedido_id,tipo,valor_centavos,status,ator_admin_id,detalhe
  ) VALUES (
    v_pedido.estabelecimento_id,v_pedido.id,'merchant_credit',
    -(v_principal_debitado_centavos + 4000),'concluido',v_uid,
    'Ajuste administrativo de chargeback: principal e taxa histórica registrados separadamente na decisão.'
  ) RETURNING id INTO v_lancamento_id;

  INSERT INTO public.decisoes_chargeback(
    ocorrencia_id,pedido_id,operacao_id,responsavel_principal,motivo,referencia,
    principal_informado_centavos,principal_debitado_centavos,taxa_centavos,
    lancamento_id,ator_admin_id
  ) VALUES (
    v_ocorrencia.id,v_pedido.id,p_operacao_id,p_responsavel_principal,v_motivo,v_referencia,
    p_principal_centavos,v_principal_debitado_centavos,4000,v_lancamento_id,v_uid
  ) RETURNING * INTO v_decisao;

  UPDATE public.ocorrencias_pagamento
  SET estado = 'encerrada'
  WHERE id = v_ocorrencia.id;

  RETURN jsonb_build_object(
    'id',v_decisao.id,'ocorrenciaId',v_decisao.ocorrencia_id,
    'responsavelPrincipal',v_decisao.responsavel_principal,
    'motivo',v_decisao.motivo,'referencia',v_decisao.referencia,
    'principalInformadoCentavos',v_decisao.principal_informado_centavos,
    'principalDebitadoCentavos',v_decisao.principal_debitado_centavos,
    'taxaCentavos',v_decisao.taxa_centavos,'lancamentoId',v_decisao.lancamento_id,
    'criadoEm',v_decisao.criado_em
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_chargeback_admin(uuid,text,text,text,bigint,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_chargeback_admin(uuid,text,text,text,bigint,uuid)
  TO authenticated;

COMMIT;
