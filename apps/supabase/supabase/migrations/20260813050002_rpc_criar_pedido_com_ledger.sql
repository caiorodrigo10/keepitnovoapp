-- =============================================================================
-- Bloco 08 — Fiação do LEDGER na RPC `criar_pedido` (CREATE OR REPLACE, forward-only).
-- Autor: @data-engineer (Dara). Data: 2026-08-13.
--
-- O QUE MUDA vs. 20260813004934: ao criar o pedido (pagamento SIMULADO no dev),
-- passa a registrar no ledger (lancamentos_financeiros), na MESMA transação:
--   * `charge`       (+ total_pago_reais)  — AUDITORIA do dinheiro que entrou.
--   * `platform_fee` (− taxa_keepit_reais) — AUDITORIA da comissão Keepit.
-- Ambos com status='concluido', disponivel_em=NULL, pedido_id do pedido criado.
-- NÃO entram na carteira (Model B — ver ledger 20260813050000): são rastreio; o
-- crédito que MOVE a carteira é o `merchant_credit` LÍQUIDO na ENTREGA (confirmar_pin).
--
-- Assinatura, validações, geração de PIN, snapshot de itens, retornos e ERROS ficam
-- IDÊNTICOS (os testes existentes continuam válidos): só adicionamos 2 INSERTs no
-- ledger ANTES do RETURN, dentro da transação (qualquer erro → ROLLBACK total).
--
-- ÉPICO 7 REAL (pagamento PIX): estes lançamentos migram para a Edge Function
-- `asaas-payment-webhook` — o `charge` nasce quando o PIX confirma (grava
-- asaas_id_externo), e o pedido só vai a 'aguardando_aceite' nesse momento. Aqui,
-- no dev, o pagamento é simulado na criação, então o registro acompanha a criação.
--
-- CONVENÇÃO DE SINAL / CENTAVOS: valor_centavos é bigint em CENTAVOS. As colunas do
-- pedido são numeric(10,2) em REAIS → converto com ROUND(reais * 100)::bigint. Uso os
-- MESMOS valores que estou gravando no snapshot do pedido (params COALESCE(...,0)).
--
-- Depende de: 20260813050000 (lancamentos_financeiros), 20260813004934 (versao anterior).
--
-- ROLLBACK (forward-only): reaplicar a migration 20260813004934 (versao sem ledger).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_estabelecimento_id           uuid,
  p_hub_id                       uuid,
  p_itens                        jsonb,
  p_subtotal_produtos_reais      numeric,
  p_taxa_deslocamento_reais      numeric,
  p_taxa_keepit_reais            numeric,
  p_taxa_servico_comprador_reais numeric,
  p_total_pago_reais             numeric,
  p_nf_solicitada                boolean
)
RETURNS TABLE (pedido_id uuid, numero integer, pin_texto text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_pin       text;
  v_pin_hash  text;
  v_rb        bytea;
  v_n         int;
  v_pedido_id uuid;
  v_numero    int;
  v_item      jsonb;
BEGIN
  -- 1) Exige sessão autenticada.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTENTICACAO_NECESSARIA'
      USING HINT = 'Sessão de cliente ausente ao chamar criar_pedido';
  END IF;

  -- 2) O autor tem de ser um CLIENTE.
  IF NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = v_uid) THEN
    RAISE EXCEPTION 'CLIENTE_NAO_ENCONTRADO'
      USING HINT = 'O usuário autenticado não possui perfil de cliente';
  END IF;

  -- 3) Itens: array não-vazio.
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array'
     OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'ITENS_INVALIDOS'
      USING HINT = 'Esperado um array JSON com ao menos 1 item do pedido';
  END IF;

  -- 4) Loja disponível.
  IF NOT EXISTS (
    SELECT 1 FROM public.estabelecimentos e
    WHERE e.id = p_estabelecimento_id
      AND e.status = 'ativo'
      AND e.pausado_manualmente = false
      AND e.excluido_em IS NULL
  ) THEN
    RAISE EXCEPTION 'LOJA_INDISPONIVEL'
      USING HINT = 'Estabelecimento inexistente, inativo, pausado ou excluído';
  END IF;

  -- 5) INVARIANTE §2.3: hub atendido pela loja.
  IF NOT EXISTS (
    SELECT 1 FROM public.estabelecimentos_hubs eh
    WHERE eh.estabelecimento_id = p_estabelecimento_id
      AND eh.hub_id = p_hub_id
  ) THEN
    RAISE EXCEPTION 'HUB_NAO_ATENDIDO'
      USING HINT = 'A loja não atende o hub informado (par ausente em estabelecimentos_hubs)';
  END IF;

  -- 6) Hub ATIVO.
  IF NOT EXISTS (SELECT 1 FROM public.hubs h WHERE h.id = p_hub_id AND h.ativo = true) THEN
    RAISE EXCEPTION 'HUB_INDISPONIVEL'
      USING HINT = 'Hub inexistente ou inativo';
  END IF;

  -- 7) PIN cripto de 4 dígitos (pgcrypto CSPRNG + rejection sampling).
  LOOP
    v_rb := extensions.gen_random_bytes(2);
    v_n  := (get_byte(v_rb, 0) << 8) | get_byte(v_rb, 1);
    EXIT WHEN v_n < 60000;
  END LOOP;
  v_pin      := lpad((v_n % 10000)::text, 4, '0');
  v_pin_hash := extensions.crypt(v_pin, extensions.gen_salt('bf', 10));

  -- 8) Insere o pedido (pagamento SIMULADO: nasce em 'aguardando_aceite', pago_em=now).
  INSERT INTO public.pedidos (
    cliente_id, estabelecimento_id, hub_id, status,
    pin_hash, pin_texto,
    subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais,
    taxa_servico_comprador_reais, total_pago_reais,
    nf_solicitada, forma_pagamento, pago_em
  )
  VALUES (
    v_uid, p_estabelecimento_id, p_hub_id, 'aguardando_aceite',
    v_pin_hash, v_pin,
    COALESCE(p_subtotal_produtos_reais, 0), COALESCE(p_taxa_deslocamento_reais, 0),
    COALESCE(p_taxa_keepit_reais, 0),
    COALESCE(p_taxa_servico_comprador_reais, 0), COALESCE(p_total_pago_reais, 0),
    COALESCE(p_nf_solicitada, false), 'pix', NOW()
  )
  RETURNING id, pedidos.numero INTO v_pedido_id, v_numero;

  -- 9) Snapshot dos itens (mesma transação).
  FOR v_item IN SELECT jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO public.pedidos_itens (
      pedido_id, produto_id, nome_snapshot, preco_unitario_reais, quantidade, subtotal_reais
    )
    VALUES (
      v_pedido_id,
      NULLIF(v_item->>'produto_id', '')::uuid,
      v_item->>'nome_snapshot',
      (v_item->>'preco_unitario')::numeric,
      (v_item->>'quantidade')::int,
      (v_item->>'preco_unitario')::numeric * (v_item->>'quantidade')::int
    );
  END LOOP;

  -- 10) LEDGER (Bloco 08): AUDITORIA do pagamento simulado. Reais → centavos.
  --     charge (+ total pago pelo cliente) e platform_fee (− comissão Keepit).
  --     status='concluido', disponivel_em=NULL. NÃO entram na carteira (Model B):
  --     o crédito que move a carteira é o merchant_credit LÍQUIDO na entrega.
  INSERT INTO public.lancamentos_financeiros (estabelecimento_id, pedido_id, tipo, valor_centavos, status, detalhe)
  VALUES (
    p_estabelecimento_id, v_pedido_id, 'charge',
    (ROUND(COALESCE(p_total_pago_reais, 0) * 100))::bigint,
    'concluido',
    'Pagamento simulado (dev) do pedido #' || v_numero::text || '. Epico 7: migra p/ webhook Asaas.'
  );

  INSERT INTO public.lancamentos_financeiros (estabelecimento_id, pedido_id, tipo, valor_centavos, status, detalhe)
  VALUES (
    p_estabelecimento_id, v_pedido_id, 'platform_fee',
    -(ROUND(COALESCE(p_taxa_keepit_reais, 0) * 100))::bigint,
    'concluido',
    'Comissao Keepit do pedido #' || v_numero::text || ' (auditoria; snapshot server-side).'
  );

  -- 11) Retorna id, numero e o PIN em texto.
  RETURN QUERY SELECT v_pedido_id, v_numero, v_pin;
END;
$$;

COMMENT ON FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) IS
  'Bloco 06 + Bloco 08. Cliente cria pedido + snapshot de itens + PIN cripto (1 transacao). '
  'DEV: pagamento SIMULADO. Bloco 08: registra no ledger charge(+total) e platform_fee(-taxa_keepit) '
  'como AUDITORIA (fora da carteira; Model B). Epico 7: esses lancamentos migram p/ o webhook Asaas. '
  'Retorna (pedido_id, numero, pin_texto). Erros: AUTENTICACAO_NECESSARIA, CLIENTE_NAO_ENCONTRADO, '
  'ITENS_INVALIDOS, LOJA_INDISPONIVEL, HUB_NAO_ATENDIDO, HUB_INDISPONIVEL.';

REVOKE ALL ON FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.criar_pedido(
  uuid, uuid, jsonb, numeric, numeric, numeric, numeric, numeric, boolean) TO authenticated;
