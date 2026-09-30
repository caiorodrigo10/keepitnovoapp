CREATE TABLE private.operacoes_hubs_admin (
  operacao_id uuid PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('aprovar', 'definir')),
  estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimentos(id) ON DELETE RESTRICT,
  hub_ids uuid[] NOT NULL,
  ator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE private.operacoes_hubs_admin IS
  'Recibos idempotentes das operações administrativas que substituem vínculos loja-hub.';

CREATE OR REPLACE FUNCTION public.aprovar_lojista_com_hubs(
  p_estabelecimento_id uuid,
  p_hub_ids uuid[],
  p_operacao_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_hub_ids uuid[];
  v_operacao private.operacoes_hubs_admin%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  SELECT coalesce(array_agg(hub_id ORDER BY hub_id), ARRAY[]::uuid[])
    INTO v_hub_ids
  FROM (SELECT DISTINCT unnest(coalesce(p_hub_ids, ARRAY[]::uuid[])) AS hub_id) normalizados;

  IF cardinality(v_hub_ids) = 0 THEN
    RAISE EXCEPTION 'HUB_OBRIGATORIO';
  END IF;

  SELECT status INTO v_status
  FROM public.estabelecimentos
  WHERE id = p_estabelecimento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESTABELECIMENTO_NAO_ENCONTRADO';
  END IF;

  SELECT * INTO v_operacao
  FROM private.operacoes_hubs_admin
  WHERE operacao_id = p_operacao_id;

  IF FOUND THEN
    IF v_operacao.tipo = 'aprovar'
       AND v_operacao.estabelecimento_id = p_estabelecimento_id
       AND v_operacao.hub_ids = v_hub_ids THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'OPERACAO_CONFLITANTE';
  END IF;

  IF v_status <> 'em_analise' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO';
  END IF;

  IF (
    SELECT count(*)
    FROM public.hubs
    WHERE id = ANY(v_hub_ids) AND ativo = true
  ) <> cardinality(v_hub_ids) THEN
    RAISE EXCEPTION 'HUB_INVALIDO';
  END IF;

  UPDATE public.estabelecimentos
  SET status = 'ativo',
      motivo_rejeicao = NULL,
      aprovado_em = now(),
      aprovado_por = auth.uid()
  WHERE id = p_estabelecimento_id;

  DELETE FROM public.estabelecimentos_hubs
  WHERE estabelecimento_id = p_estabelecimento_id;

  INSERT INTO public.estabelecimentos_hubs (estabelecimento_id, hub_id)
  SELECT p_estabelecimento_id, unnest(v_hub_ids);

  INSERT INTO private.operacoes_hubs_admin (
    operacao_id, tipo, estabelecimento_id, hub_ids, ator_id
  ) VALUES (
    p_operacao_id, 'aprovar', p_estabelecimento_id, v_hub_ids, auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_hubs_lojista(
  p_estabelecimento_id uuid,
  p_hub_ids uuid[],
  p_operacao_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hub_ids uuid[];
  v_operacao private.operacoes_hubs_admin%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;

  SELECT coalesce(array_agg(hub_id ORDER BY hub_id), ARRAY[]::uuid[])
    INTO v_hub_ids
  FROM (SELECT DISTINCT unnest(coalesce(p_hub_ids, ARRAY[]::uuid[])) AS hub_id) normalizados;

  PERFORM 1
  FROM public.estabelecimentos
  WHERE id = p_estabelecimento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESTABELECIMENTO_NAO_ENCONTRADO';
  END IF;

  SELECT * INTO v_operacao
  FROM private.operacoes_hubs_admin
  WHERE operacao_id = p_operacao_id;

  IF FOUND THEN
    IF v_operacao.tipo = 'definir'
       AND v_operacao.estabelecimento_id = p_estabelecimento_id
       AND v_operacao.hub_ids = v_hub_ids THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'OPERACAO_CONFLITANTE';
  END IF;

  IF cardinality(v_hub_ids) > 0 AND (
    SELECT count(*)
    FROM public.hubs
    WHERE id = ANY(v_hub_ids) AND ativo = true
  ) <> cardinality(v_hub_ids) THEN
    RAISE EXCEPTION 'HUB_INVALIDO';
  END IF;

  DELETE FROM public.estabelecimentos_hubs
  WHERE estabelecimento_id = p_estabelecimento_id;

  INSERT INTO public.estabelecimentos_hubs (estabelecimento_id, hub_id)
  SELECT p_estabelecimento_id, unnest(v_hub_ids);

  INSERT INTO private.operacoes_hubs_admin (
    operacao_id, tipo, estabelecimento_id, hub_ids, ator_id
  ) VALUES (
    p_operacao_id, 'definir', p_estabelecimento_id, v_hub_ids, auth.uid()
  );
END;
$$;

-- A rota antiga não pode mais ativar uma loja sem vínculo.
CREATE OR REPLACE FUNCTION public.aprovar_lojista(p_estab_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ACESSO_NEGADO';
  END IF;
  RAISE EXCEPTION 'HUB_OBRIGATORIO'
    USING DETAIL = 'Use aprovar_lojista_com_hubs para aprovar o estabelecimento ' || p_estab_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_lojista_com_hubs(uuid, uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_hubs_lojista(uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_lojista_com_hubs(uuid, uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_hubs_lojista(uuid, uuid[], uuid) TO authenticated;
