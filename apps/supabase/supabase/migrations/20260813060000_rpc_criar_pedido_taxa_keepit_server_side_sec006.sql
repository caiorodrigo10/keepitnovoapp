-- 7.12 / SEC-006: criar_pedido recalcula a taxa Keepit SERVER-SIDE (subtotal x 10%),
-- ignorando o p_taxa_keepit_reais do client. Fonte-de-verdade UI: packages/config
-- taxaKeepitPercent=10 (Rodada 8). APLICADA no keepit-dev via MCP em 2026-08-13.
-- Diferença vs 20260813050002: v_taxa_keepit := ROUND(subtotal * 10 / 100.0, 2) usado
-- no INSERT do pedido (taxa_keepit_reais) e no lancamento platform_fee. Resto idêntico.
CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_estabelecimento_id uuid, p_hub_id uuid, p_itens jsonb,
  p_subtotal_produtos_reais numeric, p_taxa_deslocamento_reais numeric,
  p_taxa_keepit_reais numeric, p_taxa_servico_comprador_reais numeric,
  p_total_pago_reais numeric, p_nf_solicitada boolean
)
RETURNS TABLE (pedido_id uuid, numero integer, pin_texto text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pin text; v_pin_hash text; v_rb bytea; v_n int;
  v_pedido_id uuid; v_numero int; v_item jsonb;
  v_taxa_keepit numeric(10,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA' USING HINT='Sessao de cliente ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = v_uid) THEN RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO' USING HINT='Usuario sem perfil de cliente'; END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'ITENS_INVALIDOS' USING HINT='Array JSON com ao menos 1 item'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.estabelecimentos e WHERE e.id=p_estabelecimento_id AND e.status='ativo' AND e.pausado_manualmente=false AND e.excluido_em IS NULL) THEN RAISE EXCEPTION 'LOJA_INDISPONIVEL' USING HINT='Estab indisponivel'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.estabelecimentos_hubs eh WHERE eh.estabelecimento_id=p_estabelecimento_id AND eh.hub_id=p_hub_id) THEN RAISE EXCEPTION 'HUB_NAO_ATENDIDO' USING HINT='Loja nao atende o hub'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hubs h WHERE h.id=p_hub_id AND h.ativo=true) THEN RAISE EXCEPTION 'HUB_INDISPONIVEL' USING HINT='Hub indisponivel'; END IF;
  v_taxa_keepit := ROUND(COALESCE(p_subtotal_produtos_reais,0) * 10 / 100.0, 2);
  LOOP v_rb := extensions.gen_random_bytes(2); v_n := (get_byte(v_rb,0) << 8) | get_byte(v_rb,1); EXIT WHEN v_n < 60000; END LOOP;
  v_pin := lpad((v_n % 10000)::text, 4, '0');
  v_pin_hash := extensions.crypt(v_pin, extensions.gen_salt('bf', 10));
  INSERT INTO public.pedidos (cliente_id, estabelecimento_id, hub_id, status, pin_hash, pin_texto, subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais, taxa_servico_comprador_reais, total_pago_reais, nf_solicitada, forma_pagamento, pago_em)
  VALUES (v_uid, p_estabelecimento_id, p_hub_id, 'aguardando_aceite', v_pin_hash, v_pin, COALESCE(p_subtotal_produtos_reais,0), COALESCE(p_taxa_deslocamento_reais,0), v_taxa_keepit, COALESCE(p_taxa_servico_comprador_reais,0), COALESCE(p_total_pago_reais,0), COALESCE(p_nf_solicitada,false), 'pix', NOW())
  RETURNING id, pedidos.numero INTO v_pedido_id, v_numero;
  FOR v_item IN SELECT jsonb_array_elements(p_itens) LOOP
    INSERT INTO public.pedidos_itens (pedido_id, produto_id, nome_snapshot, preco_unitario_reais, quantidade, subtotal_reais)
    VALUES (v_pedido_id, NULLIF(v_item->>'produto_id','')::uuid, v_item->>'nome_snapshot', (v_item->>'preco_unitario')::numeric, (v_item->>'quantidade')::int, (v_item->>'preco_unitario')::numeric * (v_item->>'quantidade')::int);
  END LOOP;
  INSERT INTO public.lancamentos_financeiros (estabelecimento_id, pedido_id, tipo, valor_centavos, status, detalhe)
  VALUES (p_estabelecimento_id, v_pedido_id, 'charge', (ROUND(COALESCE(p_total_pago_reais,0)*100))::bigint, 'concluido', 'Pagamento simulado (dev) do pedido #'||v_numero::text||'.');
  INSERT INTO public.lancamentos_financeiros (estabelecimento_id, pedido_id, tipo, valor_centavos, status, detalhe)
  VALUES (p_estabelecimento_id, v_pedido_id, 'platform_fee', -(ROUND(v_taxa_keepit*100))::bigint, 'concluido', 'Comissao Keepit (recalculada server-side, SEC-006) do pedido #'||v_numero::text||'.');
  RETURN QUERY SELECT v_pedido_id, v_numero, v_pin;
END;
$$;
REVOKE ALL ON FUNCTION public.criar_pedido(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_pedido(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.criar_pedido(uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) TO authenticated;
