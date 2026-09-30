BEGIN;
ALTER TABLE public.pedidos ALTER COLUMN status SET DEFAULT 'aguardando_pagamento';
ALTER TABLE public.pedidos ADD COLUMN cotacao_id uuid UNIQUE REFERENCES private.cotacoes(id),
  ADD COLUMN operacao_id uuid,
  ADD COLUMN forma_criacao text CHECK(forma_criacao IN ('pix','cartao'));
CREATE UNIQUE INDEX pedidos_cliente_operacao_idx ON public.pedidos(cliente_id,operacao_id) WHERE operacao_id IS NOT NULL;

-- O endpoint legado não pode conservar uma segunda autoridade financeira.
CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_estabelecimento_id uuid,p_hub_id uuid,p_itens jsonb,
  p_subtotal_produtos_reais numeric,p_taxa_deslocamento_reais numeric,p_taxa_keepit_reais numeric,
  p_taxa_servico_comprador_reais numeric,p_total_pago_reais numeric,p_nf_solicitada boolean
) RETURNS TABLE(pedido_id uuid,numero integer)
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'CHECKOUT_COTACAO_OBRIGATORIA'; END;
$$;

CREATE FUNCTION public.criar_pedido_cotado(p_cotacao_id uuid,p_forma text,p_nf_solicitada boolean,p_operacao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  q private.cotacoes%ROWTYPE; atual private.cotacoes%ROWTYPE; existente public.pedidos%ROWTYPE;
  nova jsonb; itens_input jsonb; pedido uuid; pin text; aleatorio integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  -- Serializa criação e idempotência por cliente, inclusive entre cotações distintas.
  PERFORM 1 FROM public.clientes WHERE id=auth.uid() AND NOT bloqueado FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p_cotacao_id IS NULL OR p_operacao_id IS NULL OR p_forma IS NULL OR p_forma NOT IN ('pix','cartao') OR p_nf_solicitada IS NULL
  THEN RAISE EXCEPTION 'ENTRADA_INVALIDA'; END IF;
  SELECT * INTO existente FROM public.pedidos WHERE cliente_id=auth.uid() AND operacao_id=p_operacao_id;
  IF FOUND THEN
    IF existente.cotacao_id<>p_cotacao_id OR existente.forma_criacao<>p_forma OR existente.nf_solicitada<>p_nf_solicitada
    THEN RAISE EXCEPTION 'OPERACAO_CONFLITANTE'; END IF;
    RETURN jsonb_build_object('pedidoId',existente.id);
  END IF;
  SELECT * INTO q FROM private.cotacoes WHERE id=p_cotacao_id AND cliente_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF EXISTS(SELECT FROM public.pedidos WHERE cotacao_id=q.id) THEN RAISE EXCEPTION 'COTACAO_UTILIZADA'; END IF;
  SELECT jsonb_agg(jsonb_build_object('produtoId',i->>'produtoId','quantidade',i->'quantidade')) INTO itens_input FROM jsonb_array_elements(q.itens) i;
  BEGIN
    nova:=public.cotar_pedido(q.estabelecimento_id,q.hub_id,itens_input);
  EXCEPTION WHEN raise_exception THEN RAISE EXCEPTION 'COTACAO_DESATUALIZADA'; END;
  SELECT * INTO STRICT atual FROM private.cotacoes WHERE id=(nova->>'id')::uuid;
  IF q.itens<>atual.itens OR q.taxas<>atual.taxas OR q.total_centavos<>atual.total_centavos OR q.frete_centavos<>atual.frete_centavos
  THEN RAISE EXCEPTION 'COTACAO_DESATUALIZADA'; END IF;
  DELETE FROM private.cotacoes WHERE id=atual.id;
  INSERT INTO public.pedidos(cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,
    taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,nf_solicitada,forma_pagamento,cotacao_id,operacao_id,forma_criacao)
  VALUES(auth.uid(),q.estabelecimento_id,q.hub_id,'aguardando_pagamento',q.subtotal_centavos/100.0,
    q.frete_centavos/100.0,q.comissao_centavos/100.0,(q.taxas->>'servicoCentavos')::bigint/100.0,q.total_centavos/100.0,p_nf_solicitada,p_forma,q.id,p_operacao_id,p_forma)
  RETURNING id INTO pedido;
  INSERT INTO public.pedidos_itens(pedido_id,produto_id,nome_snapshot,preco_unitario_reais,quantidade,subtotal_reais)
  SELECT pedido,(i->>'produtoId')::uuid,i->>'nome',(i->>'precoUnitarioCentavos')::bigint/100.0,
    (i->>'quantidade')::int,(i->>'precoUnitarioCentavos')::numeric*(i->>'quantidade')::int/100.0 FROM jsonb_array_elements(q.itens) i;
  LOOP aleatorio:=get_byte(extensions.gen_random_bytes(2),0)*256+get_byte(extensions.gen_random_bytes(2),1); EXIT WHEN aleatorio<60000; END LOOP;
  pin:=lpad((aleatorio%10000)::text,4,'0');
  INSERT INTO private.pedido_segredos(pedido_id,pin_hash,pin_texto) VALUES(pedido,extensions.crypt(pin,extensions.gen_salt('bf',10)),pin);
  RETURN jsonb_build_object('pedidoId',pedido);
END;
$$;

CREATE TABLE public.tentativas_pagamento(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  operacao_id uuid NOT NULL,
  forma text NOT NULL CHECK(forma IN ('pix','cartao')),
  estado text NOT NULL DEFAULT 'criando' CHECK(estado IN ('criando','pendente','confirmado','recebido','recusado','expirado','reconciliacao')),
  asaas_payment_id text UNIQUE,
  qr_code_pix text, pix_copia_e_cola text, expira_em timestamptz,
  claim_token uuid, claim_expira_em timestamptz,
  encerrada_em timestamptz, criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_id,operacao_id),
  CHECK((estado IN ('recusado','expirado'))=(encerrada_em IS NOT NULL))
);
CREATE UNIQUE INDEX tentativa_ativa_por_pedido ON public.tentativas_pagamento(pedido_id) WHERE encerrada_em IS NULL;
ALTER TABLE public.tentativas_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tentativas_pagamento FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tentativas_pagamento FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.tentativas_pagamento TO service_role;

CREATE FUNCTION private.projetar_tentativa(t public.tentativas_pagamento) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'pedidoId',t.pedido_id,'estado',t.estado) || CASE
  WHEN t.qr_code_pix IS NOT NULL AND t.pix_copia_e_cola IS NOT NULL THEN jsonb_build_object('pix',jsonb_build_object(
  'imagemBase64',t.qr_code_pix,'copiaCola',t.pix_copia_e_cola,'expiraEm',t.expira_em)) ELSE '{}'::jsonb END
$$;
CREATE FUNCTION public.reservar_tentativa_pagamento(p_pedido_id uuid,p_forma text,p_operacao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.pedidos%ROWTYPE; t public.tentativas_pagamento%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
  IF NOT FOUND OR p.cliente_id<>auth.uid() THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  IF p.status<>'aguardando_pagamento' OR p.pago_em IS NOT NULL OR p.cotacao_id IS NULL THEN RAISE EXCEPTION 'PEDIDO_NAO_PAGAVEL'; END IF;
  IF p_forma IS NULL OR p_forma NOT IN ('pix','cartao') OR p_operacao_id IS NULL THEN RAISE EXCEPTION 'ENTRADA_INVALIDA'; END IF;
  SELECT * INTO t FROM public.tentativas_pagamento WHERE cliente_id=auth.uid() AND operacao_id=p_operacao_id;
  IF FOUND THEN
    IF t.pedido_id<>p.id OR t.forma<>p_forma THEN RAISE EXCEPTION 'OPERACAO_CONFLITANTE'; END IF;
    RETURN private.projetar_tentativa(t);
  END IF;
  IF EXISTS(SELECT FROM public.tentativas_pagamento WHERE pedido_id=p.id AND encerrada_em IS NULL) THEN RAISE EXCEPTION 'TENTATIVA_EM_ANDAMENTO'; END IF;
  IF p.forma_pagamento<>p_forma THEN
    IF NOT EXISTS(SELECT FROM public.tentativas_pagamento WHERE pedido_id=p.id AND encerrada_em IS NOT NULL) THEN RAISE EXCEPTION 'FORMA_DIVERGENTE'; END IF;
  END IF;
  UPDATE public.pedidos SET forma_pagamento=p_forma,asaas_payment_id=NULL,qr_code_pix=NULL,pix_copia_e_cola=NULL WHERE id=p.id;
  INSERT INTO public.tentativas_pagamento(pedido_id,cliente_id,operacao_id,forma) VALUES(p.id,p.cliente_id,p_operacao_id,p_forma) RETURNING * INTO t;
  RETURN private.projetar_tentativa(t);
END;
$$;
CREATE FUNCTION public.consultar_tentativa_pagamento(p_pedido_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tentativas_pagamento%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT FROM public.pedidos WHERE id=p_pedido_id AND cliente_id=auth.uid()) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  SELECT * INTO t FROM public.tentativas_pagamento WHERE pedido_id=p_pedido_id ORDER BY (encerrada_em IS NULL) DESC,criado_em DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN private.projetar_tentativa(t);
END;
$$;
CREATE FUNCTION public.claim_tentativa_pagamento(p_tentativa_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tentativas_pagamento%ROWTYPE; p public.pedidos%ROWTYPE; acquired boolean:=false;
BEGIN
  -- Mesma ordem de locks das reservas e dos futuros webhooks: pedido antes da tentativa.
  SELECT p1.* INTO p FROM public.pedidos p1 JOIN public.tentativas_pagamento t1 ON t1.pedido_id=p1.id WHERE t1.id=p_tentativa_id FOR UPDATE OF p1;
  IF NOT FOUND OR p.status<>'aguardando_pagamento' OR p.pago_em IS NOT NULL THEN RAISE EXCEPTION 'PEDIDO_NAO_PAGAVEL'; END IF;
  SELECT * INTO STRICT t FROM public.tentativas_pagamento WHERE id=p_tentativa_id FOR UPDATE;
  IF t.forma<>p.forma_pagamento THEN RAISE EXCEPTION 'FORMA_DIVERGENTE'; END IF;
  IF t.estado='criando' AND t.claim_token IS NULL THEN
    UPDATE public.tentativas_pagamento SET claim_token=gen_random_uuid(),claim_expira_em=now()+interval '2 minutes' WHERE id=t.id RETURNING * INTO t;
    acquired:=true;
  ELSIF t.estado='criando' AND t.claim_expira_em<now() THEN
    UPDATE public.tentativas_pagamento SET estado='reconciliacao' WHERE id=t.id RETURNING * INTO t;
  END IF;
  RETURN jsonb_build_object('attempt',to_jsonb(t),'acquired',acquired);
END;
$$;
CREATE FUNCTION public.salvar_tentativa_pagamento(p_tentativa_id uuid,p_claim_token uuid,p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tentativas_pagamento%ROWTYPE; novo_estado text; externo text;
BEGIN
  PERFORM 1 FROM public.pedidos p JOIN public.tentativas_pagamento a ON a.pedido_id=p.id WHERE a.id=p_tentativa_id FOR UPDATE OF p;
  SELECT * INTO STRICT t FROM public.tentativas_pagamento WHERE id=p_tentativa_id FOR UPDATE;
  IF p_claim_token IS NULL OR t.claim_token IS DISTINCT FROM p_claim_token THEN RAISE EXCEPTION 'CLAIM_INVALIDO'; END IF;
  IF t.estado NOT IN ('criando','pendente','reconciliacao') THEN RAISE EXCEPTION 'TENTATIVA_ENCERRADA'; END IF;
  novo_estado:=coalesce(p_patch->>'estado',t.estado);
  externo:=coalesce(p_patch->>'asaas_payment_id',t.asaas_payment_id);
  IF novo_estado NOT IN ('pendente','reconciliacao','recusado') OR (novo_estado='pendente' AND externo IS NULL)
    OR (novo_estado='recusado' AND externo IS NOT NULL)
    OR (t.asaas_payment_id IS NOT NULL AND externo<>t.asaas_payment_id)
  THEN RAISE EXCEPTION 'TRANSICAO_INVALIDA'; END IF;
  UPDATE public.tentativas_pagamento SET estado=novo_estado,asaas_payment_id=externo,
    qr_code_pix=coalesce(p_patch->>'qr_code_pix',qr_code_pix),pix_copia_e_cola=coalesce(p_patch->>'pix_copia_e_cola',pix_copia_e_cola),
    expira_em=coalesce((p_patch->>'expira_em')::timestamptz,expira_em),encerrada_em=CASE WHEN novo_estado='recusado' THEN now() ELSE NULL END
  WHERE id=t.id RETURNING * INTO t;
  -- Compatibilidade dos leitores/webhook existentes; não confirma pagamento.
  UPDATE public.pedidos SET asaas_payment_id=t.asaas_payment_id,qr_code_pix=t.qr_code_pix,pix_copia_e_cola=t.pix_copia_e_cola WHERE id=t.pedido_id;
  RETURN to_jsonb(t);
END;
$$;
CREATE FUNCTION public.obter_pedido_pagamento(p_pedido_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p.id,'cliente_id',p.cliente_id,'cliente_nome',c.nome,'cliente_cpf',c.cpf,
   'status',p.status,'forma_pagamento',p.forma_pagamento,'pago_em',p.pago_em,'total_pago_reais',p.total_pago_reais,'total_centavos',q.total_centavos,
   'snapshot_valido',coalesce(q.cliente_id=p.cliente_id AND q.estabelecimento_id=p.estabelecimento_id AND q.hub_id=p.hub_id
     AND q.total_centavos=p.total_pago_reais*100 AND q.subtotal_centavos=p.subtotal_produtos_reais*100
     AND q.frete_centavos=p.taxa_deslocamento_reais*100 AND q.comissao_centavos=p.taxa_keepit_reais*100
     AND (q.taxas->>'servicoCentavos')::bigint=p.taxa_servico_comprador_reais*100,false))
 FROM public.pedidos p JOIN public.clientes c ON c.id=p.cliente_id LEFT JOIN private.cotacoes q ON q.id=p.cotacao_id WHERE p.id=p_pedido_id
$$;

-- Impede liberação por qualquer RPC de status, inclusive legada.
CREATE FUNCTION private.exigir_pagamento_pedido() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status IN ('aguardando_aceite','aceito','em_preparo','saindo_hub','no_hub','entregue') AND NEW.pago_em IS NULL
  THEN RAISE EXCEPTION 'PAGAMENTO_NAO_CONFIRMADO'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pedidos_exigir_pagamento BEFORE INSERT OR UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION private.exigir_pagamento_pedido();
REVOKE ALL ON FUNCTION public.criar_pedido_cotado(uuid,text,boolean,uuid),public.reservar_tentativa_pagamento(uuid,text,uuid),public.consultar_tentativa_pagamento(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.criar_pedido_cotado(uuid,text,boolean,uuid),public.reservar_tentativa_pagamento(uuid,text,uuid),public.consultar_tentativa_pagamento(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_tentativa_pagamento(uuid),public.salvar_tentativa_pagamento(uuid,uuid,jsonb),public.obter_pedido_pagamento(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tentativa_pagamento(uuid),public.salvar_tentativa_pagamento(uuid,uuid,jsonb),public.obter_pedido_pagamento(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.projetar_tentativa(public.tentativas_pagamento),private.exigir_pagamento_pedido() FROM PUBLIC,anon,authenticated;
COMMIT;
