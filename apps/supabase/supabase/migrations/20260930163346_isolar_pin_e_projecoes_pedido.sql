-- Isola os segredos de retirada e preserva criação, lockout e ledger atomicamente.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE private.pedido_segredos (
  pedido_id uuid PRIMARY KEY REFERENCES public.pedidos(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  pin_texto text NOT NULL
);
ALTER TABLE private.pedido_segredos ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.pedido_segredos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.pedido_segredos FROM PUBLIC, anon, authenticated;
INSERT INTO private.pedido_segredos (pedido_id,pin_hash,pin_texto)
SELECT id,pin_hash,pin_texto FROM public.pedidos;
ALTER TABLE public.pedidos DROP COLUMN pin_hash, DROP COLUMN pin_texto;

-- Retorno de criação também é público: não devolve o segredo.
DROP FUNCTION public.criar_pedido(uuid,uuid,jsonb,numeric,numeric,numeric,numeric,numeric,boolean);
CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_estabelecimento_id uuid, p_hub_id uuid, p_itens jsonb,
  p_subtotal_produtos_reais numeric, p_taxa_deslocamento_reais numeric,
  p_taxa_keepit_reais numeric, p_taxa_servico_comprador_reais numeric,
  p_total_pago_reais numeric, p_nf_solicitada boolean
)
RETURNS TABLE (pedido_id uuid, numero integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pin text; v_pin_hash text; v_rb bytea; v_n int;
  v_pedido_id uuid; v_numero int; v_item jsonb;
  v_taxa_keepit numeric(10,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA' USING HINT='Sessao de cliente ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = v_uid) THEN RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO' USING HINT='Usuario sem perfil de cliente'; END IF;
  -- [8.5] Cliente bloqueado pelo admin não cria novos pedidos. Checado ANTES de qualquer
  -- efeito colateral (PIN, INSERT de pedido/itens/lancamentos). AC4 da Story 8.5.
  IF EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = v_uid AND c.bloqueado = true) THEN RAISE EXCEPTION 'CLIENTE_BLOQUEADO' USING HINT='Cliente bloqueado pelo admin nao pode criar pedidos'; END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'ITENS_INVALIDOS' USING HINT='Array JSON com ao menos 1 item'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.estabelecimentos e WHERE e.id=p_estabelecimento_id AND e.status='ativo' AND e.pausado_manualmente=false AND e.excluido_em IS NULL) THEN RAISE EXCEPTION 'LOJA_INDISPONIVEL' USING HINT='Estab indisponivel'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.estabelecimentos_hubs eh WHERE eh.estabelecimento_id=p_estabelecimento_id AND eh.hub_id=p_hub_id) THEN RAISE EXCEPTION 'HUB_NAO_ATENDIDO' USING HINT='Loja nao atende o hub'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hubs h WHERE h.id=p_hub_id AND h.ativo=true) THEN RAISE EXCEPTION 'HUB_INDISPONIVEL' USING HINT='Hub indisponivel'; END IF;
  v_taxa_keepit := ROUND(COALESCE(p_subtotal_produtos_reais,0) * 10 / 100.0, 2);
  LOOP v_rb := extensions.gen_random_bytes(2); v_n := (get_byte(v_rb,0) << 8) | get_byte(v_rb,1); EXIT WHEN v_n < 60000; END LOOP;
  v_pin := lpad((v_n % 10000)::text, 4, '0');
  v_pin_hash := extensions.crypt(v_pin, extensions.gen_salt('bf', 10));
  INSERT INTO public.pedidos (cliente_id, estabelecimento_id, hub_id, status, subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais, taxa_servico_comprador_reais, total_pago_reais, nf_solicitada, forma_pagamento, pago_em)
  VALUES (v_uid, p_estabelecimento_id, p_hub_id, 'aguardando_aceite', COALESCE(p_subtotal_produtos_reais,0), COALESCE(p_taxa_deslocamento_reais,0), v_taxa_keepit, COALESCE(p_taxa_servico_comprador_reais,0), COALESCE(p_total_pago_reais,0), COALESCE(p_nf_solicitada,false), 'pix', NOW())
  RETURNING id, pedidos.numero INTO v_pedido_id, v_numero;
  INSERT INTO private.pedido_segredos (pedido_id,pin_hash,pin_texto) VALUES (v_pedido_id,v_pin_hash,v_pin);
  FOR v_item IN SELECT jsonb_array_elements(p_itens) LOOP
    INSERT INTO public.pedidos_itens (pedido_id, produto_id, nome_snapshot, preco_unitario_reais, quantidade, subtotal_reais)
    VALUES (v_pedido_id, NULLIF(v_item->>'produto_id','')::uuid, v_item->>'nome_snapshot', (v_item->>'preco_unitario')::numeric, (v_item->>'quantidade')::int, (v_item->>'preco_unitario')::numeric * (v_item->>'quantidade')::int);
  END LOOP;
  INSERT INTO public.lancamentos_financeiros (estabelecimento_id, pedido_id, tipo, valor_centavos, status, detalhe)
  VALUES (p_estabelecimento_id, v_pedido_id, 'charge', (ROUND(COALESCE(p_total_pago_reais,0)*100))::bigint, 'concluido', 'Pagamento simulado (dev) do pedido #'||v_numero::text||'.');
  INSERT INTO public.lancamentos_financeiros (estabelecimento_id, pedido_id, tipo, valor_centavos, status, detalhe)
  VALUES (p_estabelecimento_id, v_pedido_id, 'platform_fee', -(ROUND(v_taxa_keepit*100))::bigint, 'concluido', 'Comissao Keepit (recalculada server-side, SEC-006) do pedido #'||v_numero::text||'.');
  RETURN QUERY SELECT v_pedido_id, v_numero;
END;
$$;
REVOKE ALL ON FUNCTION public.criar_pedido(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_pedido(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.criar_pedido(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirmar_pin_pedido(
  p_pedido_id uuid,
  p_pin       text
)
RETURNS TABLE (resultado text, tentativas_restantes int, bloqueado_ate timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_tentativas   constant int      := 5;
  c_janela_bloqueio  constant interval := interval '5 minutes';
  c_escrow           constant interval := interval '7 days';   -- D+7 (Rodada 8)

  v_uid          uuid := auth.uid();
  v_status       text;
  v_pin_hash     text;
  v_tentativas   int;
  v_bloqueado    timestamptz;
  v_estab_id     uuid;
  v_efetivas     int;
  v_novas        int;
  v_ate          timestamptz;
  v_agora        timestamptz;
  -- Snapshot financeiro do pedido (server-side; base do crédito — SEC-006).
  v_subtotal     numeric(10,2);
  v_deslocamento numeric(10,2);
  v_taxa_keepit  numeric(10,2);
  v_liquido_cent bigint;
BEGIN
  -- 1) Exige sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de lojista ausente ao chamar confirmar_pin_pedido';
  END IF;

  -- 2) Trava a linha do pedido e lê estado + SNAPSHOT financeiro (serializa concorrência).
  SELECT p.status, p.tentativas_pin, p.pin_bloqueado_ate, p.estabelecimento_id,
         p.subtotal_produtos_reais, p.taxa_deslocamento_reais, p.taxa_keepit_reais
    INTO v_status, v_tentativas, v_bloqueado, v_estab_id,
         v_subtotal, v_deslocamento, v_taxa_keepit
  FROM public.pedidos p
  WHERE p.id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NAO_ENCONTRADO'
      USING HINT = 'Nenhum pedido com o id informado';
  END IF;

  -- 3) Somente o lojista dono; Admin não confirma entregas.
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.estabelecimentos e
      WHERE e.id = v_estab_id
        AND e.dono_user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO'
      USING HINT = 'Apenas o lojista dono do pedido pode confirmar o PIN';
  END IF;

  SELECT s.pin_hash INTO STRICT v_pin_hash FROM private.pedido_segredos s WHERE s.pedido_id = p_pedido_id;

  -- 4) Bloqueio ATIVO? Devolve resultado (não consome tentativa).
  IF v_bloqueado IS NOT NULL AND v_bloqueado > NOW() THEN
    RETURN QUERY SELECT 'pin_bloqueado'::text, 0, v_bloqueado;
    RETURN;
  END IF;

  -- 5) Estado de entrada válido: SÓ 'no_hub'.
  IF v_status <> 'no_hub' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO'
      USING HINT = 'Só é possível confirmar o PIN de um pedido em no_hub (no hub, pronto para retirada)';
  END IF;

  -- 6) Tentativas efetivas (reset por timestamp se o bloqueio expirou).
  IF v_bloqueado IS NOT NULL AND v_bloqueado <= NOW() THEN
    v_efetivas := 0;
  ELSE
    v_efetivas := COALESCE(v_tentativas, 0);
  END IF;

  -- 7) Compara o PIN (bcrypt). Nunca expõe hash/texto.
  IF extensions.crypt(p_pin, v_pin_hash) = v_pin_hash THEN
    -- ACERTO → entrega. Um único instante para entregue_em e o D+7.
    v_agora := NOW();

    UPDATE public.pedidos p
    SET status            = 'entregue',
        entregue_em       = v_agora,
        tentativas_pin    = 0,
        pin_bloqueado_ate = NULL
    WHERE p.id = p_pedido_id
      AND p.status = 'no_hub';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ESTADO_INVALIDO'
        USING HINT = 'O pedido deixou de estar em no_hub durante a confirmação';
    END IF;

    -- LEDGER (Bloco 08): crédito LÍQUIDO da entrega, do SNAPSHOT server-side (SEC-006).
    --   liquido = subtotal − taxa_keepit + deslocamento (reais) → centavos.
    --   disponivel_em = entregue_em + 7 dias (escrow D+7). status='concluido'.
    v_liquido_cent := (ROUND(
      (COALESCE(v_subtotal, 0) - COALESCE(v_taxa_keepit, 0) + COALESCE(v_deslocamento, 0)) * 100
    ))::bigint;

    INSERT INTO public.lancamentos_financeiros (
      estabelecimento_id, pedido_id, tipo, valor_centavos, status, disponivel_em, detalhe
    )
    VALUES (
      v_estab_id, p_pedido_id, 'merchant_credit', v_liquido_cent,
      'concluido', v_agora + c_escrow,
      'Credito liquido da entrega (subtotal - taxa_keepit + deslocamento); libera em D+7.'
    );

    RETURN QUERY SELECT 'entregue'::text, NULL::int, NULL::timestamptz;
    RETURN;
  END IF;

  -- 8) ERRO de PIN (persiste o incremento; por isso RETURN, nunca RAISE).
  v_novas := v_efetivas + 1;

  IF v_novas >= c_max_tentativas THEN
    v_ate := NOW() + c_janela_bloqueio;
    UPDATE public.pedidos p
    SET tentativas_pin    = 0,
        pin_bloqueado_ate = v_ate
    WHERE p.id = p_pedido_id;

    RETURN QUERY SELECT 'pin_bloqueado'::text, 0, v_ate;
    RETURN;
  ELSE
    UPDATE public.pedidos p
    SET tentativas_pin    = v_novas,
        pin_bloqueado_ate = NULL
    WHERE p.id = p_pedido_id;

    RETURN QUERY SELECT 'pin_incorreto'::text, (c_max_tentativas - v_novas), NULL::timestamptz;
    RETURN;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.confirmar_pin_pedido(uuid, text) IS
  'Bloco 07 + Bloco 08. Lojista dono confirma a ENTREGA validando o PIN (bcrypt). '
  'Unico caminho para ''entregue''. Bloco 08: no ACERTO grava no ledger merchant_credit LIQUIDO '
  '(subtotal - taxa_keepit + deslocamento) do SNAPSHOT server-side (SEC-006), disponivel_em = '
  'entregue_em + 7 dias (escrow D+7). Lockout 5/5min, reset por timestamp, FOR UPDATE anti-race. '
  'Retorna (resultado, tentativas_restantes, bloqueado_ate). Excecoes: AUTENTICACAO_NECESSARIA, '
  'PEDIDO_NAO_ENCONTRADO, ACESSO_NEGADO, ESTADO_INVALIDO.';

REVOKE ALL ON FUNCTION public.confirmar_pin_pedido(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_pin_pedido(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirmar_pin_pedido(uuid, text) TO authenticated;

-- Somente o cliente dono de um pedido efetivamente pago pode recuperar o PIN.
CREATE FUNCTION public.obter_pin_cliente(p_pedido_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pin text;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) OR NOT EXISTS (
    SELECT 1 FROM public.pedidos p JOIN public.clientes c ON c.id=p.cliente_id
    WHERE p.id=p_pedido_id AND p.cliente_id=auth.uid() AND p.pago_em IS NOT NULL
  ) THEN RAISE EXCEPTION 'ACESSO_NEGADO'; END IF;
  SELECT s.pin_texto INTO STRICT v_pin FROM private.pedido_segredos s WHERE s.pedido_id=p_pedido_id;
  RETURN v_pin;
END;
$$;
REVOKE ALL ON FUNCTION public.obter_pin_cliente(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.obter_pin_cliente(uuid) TO authenticated;

-- Computed field PostgREST: reconsulta o pedido real (não confia no composite
-- fornecido pelo chamador), projeta apenas nome e aplica a mesma autorização.
CREATE FUNCTION public.pedido_cliente_nome(pedido public.pedidos)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT c.nome FROM public.pedidos p JOIN public.clientes c ON c.id=p.cliente_id
 WHERE p.id=pedido.id AND auth.uid() IS NOT NULL AND public.pode_ver_pedido(p);
$$;
REVOKE ALL ON FUNCTION public.pedido_cliente_nome(public.pedidos) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pedido_cliente_nome(public.pedidos) TO authenticated;
COMMIT;
