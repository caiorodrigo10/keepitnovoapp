-- Complementos MVP: grupos por produto, seleção autoritativa e snapshot imutável.
BEGIN;

CREATE TABLE public.produto_complemento_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  tipo text NOT NULL CHECK (tipo IN ('unica', 'multipla')),
  min_selecoes integer NOT NULL CHECK (min_selecoes >= 0),
  max_selecoes integer NOT NULL CHECK (max_selecoes >= 1 AND min_selecoes <= max_selecoes),
  ordem integer NOT NULL DEFAULT 0,
  CHECK ((tipo = 'unica' AND min_selecoes BETWEEN 0 AND 1 AND max_selecoes = 1) OR tipo = 'multipla')
);
CREATE INDEX produto_complemento_grupos_produto_id_idx ON public.produto_complemento_grupos(produto_id);

CREATE TABLE public.produto_complemento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.produto_complemento_grupos(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  preco_extra_reais numeric(10,2) NOT NULL DEFAULT 0 CHECK (preco_extra_reais >= 0),
  ordem integer NOT NULL DEFAULT 0
);
CREATE INDEX produto_complemento_itens_grupo_id_idx ON public.produto_complemento_itens(grupo_id);

ALTER TABLE public.pedidos_itens ADD COLUMN complementos_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.pedidos_itens ADD CONSTRAINT pedidos_itens_complementos_snapshot_array CHECK (jsonb_typeof(complementos_snapshot) = 'array');

ALTER TABLE public.produto_complemento_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_complemento_grupos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.produto_complemento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_complemento_itens FORCE ROW LEVEL SECURITY;

CREATE POLICY complemento_grupo_leitura_autorizada ON public.produto_complemento_grupos FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = produto_id)
);
CREATE POLICY complemento_item_leitura_autorizada ON public.produto_complemento_itens FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.produto_complemento_grupos g WHERE g.id = grupo_id)
);
REVOKE ALL ON public.produto_complemento_grupos, public.produto_complemento_itens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.produto_complemento_grupos, public.produto_complemento_itens TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.salvar_produto_complementos(p_produto_id uuid, p_produto jsonb, p_grupos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_produto public.produtos%ROWTYPE;
  v_grupo jsonb;
  v_item jsonb;
  v_grupo_id uuid;
  v_item_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_item_ids uuid[];
  v_enviou_grupos boolean := p_grupos IS NOT NULL;
BEGIN
  PERFORM private.exigir_conta_gravavel(auth.uid());
  IF p_produto IS NULL OR jsonb_typeof(p_produto) <> 'object' THEN RAISE EXCEPTION 'PRODUTO_INVALIDO'; END IF;
  IF p_grupos IS NOT NULL AND jsonb_typeof(p_grupos) <> 'array' THEN RAISE EXCEPTION 'COMPLEMENTOS_INVALIDOS'; END IF;

  IF p_produto_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.estabelecimentos e WHERE e.id = (p_produto->>'estabelecimentoId')::uuid AND (e.dono_user_id = auth.uid() OR public.is_admin())) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
    INSERT INTO public.produtos(estabelecimento_id,nome,descricao,preco_reais,categoria_produto,foto_url)
    VALUES ((p_produto->>'estabelecimentoId')::uuid,btrim(p_produto->>'nome'),nullif(p_produto->>'descricao',''),(p_produto->>'precoReais')::numeric,btrim(p_produto->>'categoriaProduto'),nullif(p_produto->>'fotoUrl',''))
    RETURNING * INTO v_produto;
  ELSE
    SELECT * INTO v_produto FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.estabelecimentos e WHERE e.id = v_produto.estabelecimento_id AND (e.dono_user_id = auth.uid() OR public.is_admin())) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
    UPDATE public.produtos SET nome=coalesce(btrim(p_produto->>'nome'),nome), descricao=coalesce(nullif(p_produto->>'descricao',''),descricao), preco_reais=coalesce((p_produto->>'precoReais')::numeric,preco_reais), categoria_produto=coalesce(btrim(p_produto->>'categoriaProduto'),categoria_produto), foto_url=coalesce(nullif(p_produto->>'fotoUrl',''),foto_url), ativo=coalesce((p_produto->>'ativo')::boolean,ativo) WHERE id=v_produto.id RETURNING * INTO v_produto;
  END IF;

  IF v_enviou_grupos THEN
    FOR v_grupo IN SELECT value FROM jsonb_array_elements(p_grupos) LOOP
      IF jsonb_typeof(v_grupo) <> 'object' OR length(btrim(coalesce(v_grupo->>'nome',''))) = 0
        OR coalesce(v_grupo->>'tipo','') NOT IN ('unica','multipla')
        OR coalesce(v_grupo->>'minSelecoes','') !~ '^[0-9]+$' OR coalesce(v_grupo->>'maxSelecoes','') !~ '^[1-9][0-9]*$'
      THEN RAISE EXCEPTION 'COMPLEMENTOS_INVALIDOS'; END IF;
      IF v_grupo ? 'id' THEN
        v_grupo_id := (v_grupo->>'id')::uuid;
        UPDATE public.produto_complemento_grupos SET nome=btrim(v_grupo->>'nome'),tipo=v_grupo->>'tipo',min_selecoes=(v_grupo->>'minSelecoes')::int,max_selecoes=(v_grupo->>'maxSelecoes')::int,ordem=coalesce((v_grupo->>'ordem')::int,0) WHERE id=v_grupo_id AND produto_id=v_produto.id;
        IF NOT FOUND THEN RAISE EXCEPTION 'COMPLEMENTOS_INVALIDOS'; END IF;
      ELSE
        INSERT INTO public.produto_complemento_grupos(produto_id,nome,tipo,min_selecoes,max_selecoes,ordem) VALUES(v_produto.id,btrim(v_grupo->>'nome'),v_grupo->>'tipo',(v_grupo->>'minSelecoes')::int,(v_grupo->>'maxSelecoes')::int,coalesce((v_grupo->>'ordem')::int,0)) RETURNING id INTO v_grupo_id;
      END IF;
      v_ids := array_append(v_ids,v_grupo_id); v_item_ids := ARRAY[]::uuid[];
      IF jsonb_typeof(v_grupo->'itens') <> 'array' OR jsonb_array_length(v_grupo->'itens') = 0 THEN RAISE EXCEPTION 'COMPLEMENTOS_INVALIDOS'; END IF;
      IF (v_grupo->>'tipo' = 'unica' AND ((v_grupo->>'minSelecoes')::int NOT BETWEEN 0 AND 1 OR (v_grupo->>'maxSelecoes')::int <> 1)) OR (v_grupo->>'minSelecoes')::int > (v_grupo->>'maxSelecoes')::int OR (v_grupo->>'maxSelecoes')::int > jsonb_array_length(v_grupo->'itens') THEN RAISE EXCEPTION 'COMPLEMENTOS_INVALIDOS'; END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_grupo->'itens') LOOP
        IF jsonb_typeof(v_item) <> 'object' OR length(btrim(coalesce(v_item->>'nome',''))) = 0 OR coalesce(v_item->>'precoExtraReais','') !~ '^[0-9]+(\\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'COMPLEMENTOS_INVALIDOS'; END IF;
        IF v_item ? 'id' THEN
          v_item_id := (v_item->>'id')::uuid;
          UPDATE public.produto_complemento_itens SET nome=btrim(v_item->>'nome'),preco_extra_reais=(v_item->>'precoExtraReais')::numeric,ordem=coalesce((v_item->>'ordem')::int,0) WHERE id=v_item_id AND grupo_id=v_grupo_id;
          IF NOT FOUND THEN RAISE EXCEPTION 'COMPLEMENTOS_INVALIDOS'; END IF;
        ELSE
          INSERT INTO public.produto_complemento_itens(grupo_id,nome,preco_extra_reais,ordem) VALUES(v_grupo_id,btrim(v_item->>'nome'),(v_item->>'precoExtraReais')::numeric,coalesce((v_item->>'ordem')::int,0)) RETURNING id INTO v_item_id;
        END IF;
        v_item_ids := array_append(v_item_ids,v_item_id);
      END LOOP;
      DELETE FROM public.produto_complemento_itens WHERE grupo_id=v_grupo_id AND NOT (id = ANY(v_item_ids));
    END LOOP;
    DELETE FROM public.produto_complemento_grupos WHERE produto_id=v_produto.id AND NOT (id = ANY(v_ids));
  END IF;
  RETURN jsonb_build_object('id',v_produto.id);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_produto_complementos(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_produto_complementos(uuid,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.cotar_pedido_sem_guarda_exclusao(p_estabelecimento_id uuid,p_hub_id uuid,p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  loja public.estabelecimentos%ROWTYPE; produto public.produtos%ROWTYPE; taxas public.configuracoes_taxas%ROWTYPE;
  item jsonb; produto_id uuid; quantidade bigint; preco bigint; extras bigint; subtotal numeric:=0; frete bigint; comissao bigint; total numeric; liquido bigint; snapshot jsonb:='[]'::jsonb; complementos jsonb; ids text[]; item_key text; item_keys text[]:=ARRAY[]::text[]; taxas_snapshot jsonb; cotacao_id uuid; grupo record;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT FROM public.clientes c WHERE c.id=auth.uid() AND NOT c.bloqueado) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens)<>'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'ITENS_INVALIDOS'; END IF;
  SELECT * INTO loja FROM public.estabelecimentos WHERE id=p_estabelecimento_id FOR SHARE;
  IF NOT FOUND OR loja.status<>'ativo' OR loja.pausado_manualmente OR loja.excluido_em IS NOT NULL THEN RAISE EXCEPTION 'LOJA_INDISPONIVEL'; END IF;
  PERFORM 1 FROM public.hubs h JOIN public.estabelecimentos_hubs eh ON eh.hub_id=h.id WHERE h.id=p_hub_id AND h.ativo AND eh.estabelecimento_id=loja.id FOR SHARE OF h,eh;
  IF NOT FOUND THEN RAISE EXCEPTION 'HUB_INDISPONIVEL'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    IF jsonb_typeof(item)<>'object' OR coalesce(item->>'quantidade','') !~ '^[1-9][0-9]*$' OR coalesce(item->>'produtoId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR (item ? 'complementoIds' AND jsonb_typeof(item->'complementoIds')<>'array') THEN RAISE EXCEPTION 'ITENS_INVALIDOS'; END IF;
    produto_id := (item->>'produtoId')::uuid; quantidade := (item->>'quantidade')::bigint;
    SELECT * INTO produto FROM public.produtos WHERE id=produto_id AND estabelecimento_id=loja.id AND ativo AND excluido_em IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUTO_INDISPONIVEL'; END IF;
    SELECT coalesce(array_agg(x ORDER BY x),ARRAY[]::text[]) INTO ids FROM jsonb_array_elements_text(coalesce(item->'complementoIds','[]'::jsonb)) x;
    IF array_length(ids,1) IS DISTINCT FROM (SELECT count(DISTINCT x) FROM unnest(ids) x) OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'COMPLEMENTOS_INVALIDOS'; END IF;
    item_key := produto_id::text || ':' || array_to_string(ids,',');
    IF item_key = ANY(item_keys) THEN RAISE EXCEPTION 'ITENS_INVALIDOS'; END IF; item_keys:=array_append(item_keys,item_key);
    FOR grupo IN SELECT g.id,g.nome,g.min_selecoes,g.max_selecoes,g.tipo FROM public.produto_complemento_grupos g WHERE g.produto_id=produto.id ORDER BY g.ordem,g.id FOR SHARE LOOP
      IF (SELECT count(*) FROM public.produto_complemento_itens ci WHERE ci.grupo_id=grupo.id AND ci.id::text=ANY(ids)) NOT BETWEEN grupo.min_selecoes AND grupo.max_selecoes THEN RAISE EXCEPTION 'SELECAO_COMPLEMENTOS_INVALIDA'; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM unnest(ids) x LEFT JOIN public.produto_complemento_itens ci ON ci.id::text=x LEFT JOIN public.produto_complemento_grupos g ON g.id=ci.grupo_id WHERE ci.id IS NULL OR g.produto_id<>produto.id) THEN RAISE EXCEPTION 'COMPLEMENTOS_INVALIDOS'; END IF;
    SELECT coalesce(sum((ci.preco_extra_reais*100)::bigint),0),coalesce(jsonb_agg(jsonb_build_object('grupoId',g.id,'grupoNome',g.nome,'itemId',ci.id,'itemNome',ci.nome,'precoExtraCentavos',(ci.preco_extra_reais*100)::bigint) ORDER BY g.ordem,g.id,ci.ordem,ci.id),'[]'::jsonb) INTO extras,complementos FROM public.produto_complemento_itens ci JOIN public.produto_complemento_grupos g ON g.id=ci.grupo_id WHERE ci.id::text=ANY(ids);
    preco := (produto.preco_reais*100)::bigint + extras; subtotal := subtotal + preco::numeric*quantidade;
    IF subtotal>9007199254740991 THEN RAISE EXCEPTION 'VALOR_INVALIDO'; END IF;
    snapshot:=snapshot||jsonb_build_array(jsonb_build_object('produtoId',produto.id,'nome',produto.nome,'precoUnitarioCentavos',preco,'quantidade',quantidade,'complementoIds',to_jsonb(ids),'complementosSnapshot',complementos));
  END LOOP;
  IF subtotal<coalesce(loja.ticket_minimo_reais*100,2000) THEN RAISE EXCEPTION 'MINIMO_NAO_ATINGIDO'; END IF;
  SELECT * INTO STRICT taxas FROM public.configuracoes_taxas WHERE singleton FOR SHARE; frete:=(loja.taxa_deslocamento_reais*100)::bigint; comissao:=round(subtotal*taxas.comissao_bps/10000); total:=subtotal+frete+taxas.servico_centavos; IF total>9007199254740991 THEN RAISE EXCEPTION 'VALOR_INVALIDO'; END IF; liquido:=subtotal-comissao+frete; taxas_snapshot:=jsonb_build_object('versao',taxas.versao,'comissaoBps',taxas.comissao_bps,'servicoCentavos',taxas.servico_centavos);
  INSERT INTO private.cotacoes(cliente_id,estabelecimento_id,hub_id,itens,taxas,subtotal_centavos,frete_centavos,comissao_centavos,total_centavos,liquido_lojista_centavos) VALUES(auth.uid(),loja.id,p_hub_id,snapshot,taxas_snapshot,subtotal,frete,comissao,total,liquido) RETURNING id INTO cotacao_id;
  RETURN jsonb_build_object('id',cotacao_id,'taxas',taxas_snapshot,'subtotalCentavos',subtotal,'freteCentavos',frete,'comissaoCentavos',comissao,'totalCentavos',total,'liquidoLojistaCentavos',liquido);
END;
$$;

CREATE OR REPLACE FUNCTION public.criar_pedido_cotado_sem_guarda_exclusao(p_cotacao_id uuid,p_forma text,p_nf_solicitada boolean,p_operacao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q private.cotacoes%ROWTYPE; atual private.cotacoes%ROWTYPE; existente public.pedidos%ROWTYPE; nova jsonb; itens_input jsonb; pedido uuid; pin text; aleatorio integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF; PERFORM 1 FROM public.clientes WHERE id=auth.uid() AND NOT bloqueado FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_cotacao_id IS NULL OR p_operacao_id IS NULL OR p_forma NOT IN ('pix','cartao') OR p_nf_solicitada IS NULL THEN RAISE EXCEPTION 'ENTRADA_INVALIDA'; END IF;
  SELECT * INTO existente FROM public.pedidos WHERE cliente_id=auth.uid() AND operacao_id=p_operacao_id; IF FOUND THEN IF existente.cotacao_id<>p_cotacao_id OR existente.forma_criacao<>p_forma OR existente.nf_solicitada<>p_nf_solicitada THEN RAISE EXCEPTION 'OPERACAO_CONFLITANTE'; END IF; RETURN jsonb_build_object('pedidoId',existente.id); END IF;
  SELECT * INTO q FROM private.cotacoes WHERE id=p_cotacao_id AND cliente_id=auth.uid() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF; IF EXISTS(SELECT FROM public.pedidos WHERE cotacao_id=q.id) THEN RAISE EXCEPTION 'COTACAO_UTILIZADA'; END IF;
  SELECT jsonb_agg(jsonb_build_object('produtoId',i->>'produtoId','quantidade',i->'quantidade','complementoIds',coalesce(i->'complementoIds','[]'::jsonb))) INTO itens_input FROM jsonb_array_elements(q.itens) i;
  BEGIN nova:=public.cotar_pedido_sem_guarda_exclusao(q.estabelecimento_id,q.hub_id,itens_input); EXCEPTION WHEN raise_exception THEN RAISE EXCEPTION 'COTACAO_DESATUALIZADA'; END;
  SELECT * INTO STRICT atual FROM private.cotacoes WHERE id=(nova->>'id')::uuid; IF q.itens<>atual.itens OR q.taxas<>atual.taxas OR q.total_centavos<>atual.total_centavos OR q.frete_centavos<>atual.frete_centavos THEN RAISE EXCEPTION 'COTACAO_DESATUALIZADA'; END IF; DELETE FROM private.cotacoes WHERE id=atual.id;
  INSERT INTO public.pedidos(cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,nf_solicitada,forma_pagamento,cotacao_id,operacao_id,forma_criacao) VALUES(auth.uid(),q.estabelecimento_id,q.hub_id,'aguardando_pagamento',q.subtotal_centavos/100.0,q.frete_centavos/100.0,q.comissao_centavos/100.0,(q.taxas->>'servicoCentavos')::bigint/100.0,q.total_centavos/100.0,p_nf_solicitada,p_forma,q.id,p_operacao_id,p_forma) RETURNING id INTO pedido;
  INSERT INTO public.pedidos_itens(pedido_id,produto_id,nome_snapshot,preco_unitario_reais,quantidade,subtotal_reais,complementos_snapshot) SELECT pedido,(i->>'produtoId')::uuid,i->>'nome',(i->>'precoUnitarioCentavos')::bigint/100.0,(i->>'quantidade')::int,(i->>'precoUnitarioCentavos')::numeric*(i->>'quantidade')::int/100.0,coalesce(i->'complementosSnapshot','[]'::jsonb) FROM jsonb_array_elements(q.itens) i;
  LOOP aleatorio:=get_byte(extensions.gen_random_bytes(2),0)*256+get_byte(extensions.gen_random_bytes(2),1); EXIT WHEN aleatorio<60000; END LOOP; pin:=lpad((aleatorio%10000)::text,4,'0'); INSERT INTO private.pedido_segredos(pedido_id,pin_hash,pin_texto) VALUES(pedido,extensions.crypt(pin,extensions.gen_salt('bf',10)),pin); RETURN jsonb_build_object('pedidoId',pedido);
END;
$$;
REVOKE ALL ON FUNCTION public.cotar_pedido_sem_guarda_exclusao(uuid,uuid,jsonb), public.criar_pedido_cotado_sem_guarda_exclusao(uuid,text,boolean,uuid) FROM PUBLIC, anon, authenticated;
COMMIT;
