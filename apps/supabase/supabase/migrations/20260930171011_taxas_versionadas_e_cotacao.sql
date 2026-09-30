BEGIN;
CREATE TABLE public.configuracoes_taxas (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  versao uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  comissao_bps integer NOT NULL CHECK (comissao_bps BETWEEN 0 AND 10000),
  servico_centavos bigint NOT NULL CHECK (servico_centavos BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE public.historico_taxas (
  operacao_id uuid PRIMARY KEY,
  ator_id uuid NOT NULL REFERENCES auth.users(id),
  motivo text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 1 AND 1000),
  antes jsonb NOT NULL,
  depois jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.cotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimentos(id),
  hub_id uuid NOT NULL REFERENCES public.hubs(id),
  itens jsonb NOT NULL,
  taxas jsonb NOT NULL,
  subtotal_centavos bigint NOT NULL CHECK (subtotal_centavos BETWEEN 0 AND 9007199254740991),
  frete_centavos bigint NOT NULL CHECK (frete_centavos BETWEEN 0 AND 9007199254740991),
  comissao_centavos bigint NOT NULL CHECK (comissao_centavos BETWEEN 0 AND 9007199254740991),
  total_centavos bigint NOT NULL CHECK (total_centavos BETWEEN 0 AND 9007199254740991),
  liquido_lojista_centavos bigint NOT NULL CHECK (liquido_lojista_centavos BETWEEN 0 AND 9007199254740991),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cotacoes_cliente_id_idx ON private.cotacoes(cliente_id);
ALTER TABLE public.configuracoes_taxas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_taxas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.historico_taxas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_taxas FORCE ROW LEVEL SECURITY;
ALTER TABLE private.cotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.cotacoes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.configuracoes_taxas, public.historico_taxas, private.cotacoes FROM PUBLIC, anon, authenticated;
-- Único seed. Alterações futuras preservam auditoria e snapshots existentes.
INSERT INTO public.configuracoes_taxas(comissao_bps,servico_centavos) VALUES (1000,290);

CREATE FUNCTION public.obter_taxas() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  RETURN (SELECT jsonb_build_object('versao',versao,'comissaoBps',comissao_bps,'servicoCentavos',servico_centavos)
          FROM public.configuracoes_taxas WHERE singleton);
END;
$$;
CREATE FUNCTION public.alterar_taxas(p_comissao_bps integer,p_servico_centavos bigint,p_versao_esperada uuid,p_motivo text,p_operacao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  atual public.configuracoes_taxas%ROWTYPE;
  anterior jsonb;
  nova jsonb;
  operacao public.historico_taxas%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_comissao_bps IS NULL OR p_comissao_bps NOT BETWEEN 0 AND 10000
    OR p_servico_centavos IS NULL OR p_servico_centavos NOT BETWEEN 0 AND 9007199254740991
    OR p_versao_esperada IS NULL OR p_operacao_id IS NULL
    OR p_motivo IS NULL OR length(btrim(p_motivo)) NOT BETWEEN 1 AND 1000
  THEN RAISE EXCEPTION 'TAXAS_INVALIDAS'; END IF;
  SELECT * INTO STRICT atual FROM public.configuracoes_taxas WHERE singleton FOR UPDATE;
  SELECT * INTO operacao FROM public.historico_taxas WHERE operacao_id=p_operacao_id;
  IF FOUND THEN
    IF operacao.ator_id<>auth.uid() OR operacao.motivo<>btrim(p_motivo)
      OR operacao.antes->>'versao'<>p_versao_esperada::text
      OR (operacao.depois->>'comissaoBps')::int<>p_comissao_bps
      OR (operacao.depois->>'servicoCentavos')::bigint<>p_servico_centavos
    THEN RAISE EXCEPTION 'OPERACAO_CONFLITANTE'; END IF;
    RETURN operacao.depois;
  END IF;
  IF atual.versao<>p_versao_esperada THEN RAISE EXCEPTION 'VERSAO_CONFLITANTE'; END IF;
  anterior:=public.obter_taxas();
  UPDATE public.configuracoes_taxas SET versao=gen_random_uuid(),comissao_bps=p_comissao_bps,servico_centavos=p_servico_centavos WHERE singleton;
  nova:=public.obter_taxas();
  INSERT INTO public.historico_taxas(operacao_id,ator_id,motivo,antes,depois)
  VALUES (p_operacao_id,auth.uid(),btrim(p_motivo),anterior,nova);
  RETURN nova;
END;
$$;
CREATE FUNCTION public.listar_historico_taxas() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('operacaoId',operacao_id,'atorId',ator_id,'motivo',motivo,
    'antes',antes,'depois',depois,'criadoEm',criado_em) ORDER BY criado_em DESC,operacao_id), '[]'::jsonb)
    FROM public.historico_taxas);
END;
$$;
CREATE FUNCTION public.cotar_pedido(p_estabelecimento_id uuid,p_hub_id uuid,p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  loja public.estabelecimentos%ROWTYPE;
  produto public.produtos%ROWTYPE;
  taxas public.configuracoes_taxas%ROWTYPE;
  agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  chegada timestamp;
  item jsonb;
  ids uuid[] := ARRAY[]::uuid[];
  produto_id uuid;
  quantidade bigint;
  preco bigint;
  subtotal numeric := 0;
  frete bigint;
  comissao bigint;
  total numeric;
  liquido bigint;
  snapshot jsonb := '[]'::jsonb;
  taxas_snapshot jsonb;
  cotacao_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT FROM public.clientes c WHERE c.id=auth.uid() AND NOT c.bloqueado)
  THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens)<>'array' THEN RAISE EXCEPTION 'ITENS_INVALIDOS'; END IF;
  IF jsonb_array_length(p_itens) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'ITENS_INVALIDOS'; END IF;
  SELECT * INTO loja FROM public.estabelecimentos WHERE id=p_estabelecimento_id FOR SHARE;
  IF NOT FOUND OR loja.status<>'ativo' OR loja.pausado_manualmente OR loja.excluido_em IS NOT NULL
  THEN RAISE EXCEPTION 'LOJA_INDISPONIVEL'; END IF;
  PERFORM 1 FROM public.hubs h JOIN public.estabelecimentos_hubs eh ON eh.hub_id=h.id
    WHERE h.id=p_hub_id AND h.ativo AND eh.estabelecimento_id=loja.id FOR SHARE OF h,eh;
  IF NOT FOUND THEN RAISE EXCEPTION 'HUB_INDISPONIVEL'; END IF;
  chegada:=agora+make_interval(mins=>loja.tempo_medio_entrega_min+10);
  IF NOT EXISTS(SELECT FROM public.estabelecimentos_horarios h WHERE h.estabelecimento_id=loja.id
    AND h.dia_semana=extract(dow FROM agora) AND h.aberto AND agora>=agora::date+h.hora_abre AND agora<agora::date+h.hora_fecha)
    OR NOT EXISTS(SELECT FROM public.hubs_horarios h WHERE h.hub_id=p_hub_id
    AND h.dia_semana=extract(dow FROM agora) AND h.aberto AND agora>=agora::date+h.hora_abre AND chegada<=agora::date+h.hora_fecha)
  THEN RAISE EXCEPTION 'HORARIO_INVIAVEL'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'quantidade') IS DISTINCT FROM 'number'
      OR coalesce(item->>'quantidade','') !~ '^[1-9][0-9]*$'
      OR (item->>'quantidade')::numeric>2147483647
      OR coalesce(item->>'produtoId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN RAISE EXCEPTION 'ITENS_INVALIDOS'; END IF;
    produto_id:=(item->>'produtoId')::uuid;
    IF produto_id=ANY(ids) THEN RAISE EXCEPTION 'ITENS_INVALIDOS'; END IF;
    ids:=array_append(ids,produto_id);
    quantidade:=(item->>'quantidade')::bigint;
    SELECT * INTO produto FROM public.produtos WHERE id=produto_id AND estabelecimento_id=loja.id AND ativo AND excluido_em IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUTO_INDISPONIVEL'; END IF;
    preco:=(produto.preco_reais*100)::bigint;
    subtotal:=subtotal+preco::numeric*quantidade;
    IF subtotal>9007199254740991 THEN RAISE EXCEPTION 'VALOR_INVALIDO'; END IF;
    snapshot:=snapshot||jsonb_build_array(jsonb_build_object('produtoId',produto.id,'nome',produto.nome,'precoUnitarioCentavos',preco,'quantidade',quantidade));
  END LOOP;
  IF subtotal<coalesce(loja.ticket_minimo_reais*100,2000) THEN RAISE EXCEPTION 'MINIMO_NAO_ATINGIDO'; END IF;
  SELECT * INTO STRICT taxas FROM public.configuracoes_taxas WHERE singleton FOR SHARE;
  frete:=(loja.taxa_deslocamento_reais*100)::bigint;
  comissao:=round(subtotal*taxas.comissao_bps/10000);
  total:=subtotal+frete+taxas.servico_centavos;
  IF total>9007199254740991 THEN RAISE EXCEPTION 'VALOR_INVALIDO'; END IF;
  liquido:=subtotal-comissao+frete;
  taxas_snapshot:=jsonb_build_object('versao',taxas.versao,'comissaoBps',taxas.comissao_bps,'servicoCentavos',taxas.servico_centavos);
  INSERT INTO private.cotacoes(cliente_id,estabelecimento_id,hub_id,itens,taxas,subtotal_centavos,frete_centavos,comissao_centavos,total_centavos,liquido_lojista_centavos)
  VALUES (auth.uid(),loja.id,p_hub_id,snapshot,taxas_snapshot,subtotal,frete,comissao,total,liquido) RETURNING id INTO cotacao_id;
  RETURN jsonb_build_object('id',cotacao_id,'taxas',taxas_snapshot,'subtotalCentavos',subtotal,'freteCentavos',frete,
    'comissaoCentavos',comissao,'totalCentavos',total,'liquidoLojistaCentavos',liquido);
END;
$$;
REVOKE ALL ON FUNCTION public.obter_taxas(),public.alterar_taxas(integer,bigint,uuid,text,uuid),public.listar_historico_taxas(),public.cotar_pedido(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_taxas(),public.alterar_taxas(integer,bigint,uuid,text,uuid),public.listar_historico_taxas(),public.cotar_pedido(uuid,uuid,jsonb) TO authenticated;
COMMIT;
