-- =============================================================================
-- Story 7.5 — RPC `confirmar_pagamento_pedido` (webhook Asaas
-- `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED`).
-- Autor: @dev (Dex). Data: 2026-08-27.
--
-- O QUE É: chamada exclusivamente pela Edge Function
-- `asaas-payment-webhook` (`service_role`, nunca sessão de usuário). Localiza
-- o pedido por `asaas_payment_id` (preferencial) ou, defensivamente, por
-- `id::text = p_external_reference` (fallback previsto em
-- `docs/gateway/asaas-api-reference.md` §"Webhooks"), trava a linha (`FOR
-- UPDATE`) e:
--   * não encontrou            → 'pedido_nao_encontrado'
--   * status <> 'aguardando_pagamento' → 'ja_processado' (idempotência —
--     fecha IDEMP-001 do gate da Story 7.2; nenhum UPDATE/INSERT novo)
--   * status = 'aguardando_pagamento'  → UPDATE pedidos (status=
--     'aguardando_aceite', pago_em=NOW(), backfill de asaas_payment_id via
--     COALESCE) + INSERT em lancamentos_financeiros (tipo='charge',
--     AUDITORIA — Model B, ver 20260813050000) → 'confirmado'
--
-- POR QUE HOJE FICA DORMANT: nenhum pedido em produção nasce em
-- 'aguardando_pagamento' — a RPC `criar_pedido` ativa (versão `070003`)
-- continua gravando `status='aguardando_aceite'` LITERAL + ledger
-- `charge`/`platform_fee` na CRIAÇÃO (pagamento simulado, Bloco 08). Editar
-- `criar_pedido` para de fato nascer em 'aguardando_pagamento' fica para uma
-- Story de religamento futura, bloqueada por ASAAS-1/ASAAS-2 (mesmo racional
-- SEQ-001 do gate da Story 7.2 — não travar pedidos reais sem caminho de
-- confirmação possível). Ver docs/stories/7.5.story.md, seção "Reconciliação
-- com o épico — Decisão de sequência". Consequência: mesmo que esta RPC seja
-- chamada hoje por engano/teste manual contra um pedido real, a cláusula
-- `IF v_status <> 'aguardando_pagamento'` garante que ela SEMPRE cai em
-- 'ja_processado' — nunca duplica o `charge` que `criar_pedido` já gravou.
--
-- IDEMPOTÊNCIA (IDEMP-001): o `SELECT ... FOR UPDATE` + a checagem de status
-- acontecem DENTRO da mesma transação da RPC — 2 chamadas concorrentes para
-- o mesmo evento (entrega "at least once" do Asaas) serializam: a 1ª grava e
-- retorna 'confirmado', a 2ª (bloqueada até a 1ª commitar) vê o status já
-- 'aguardando_aceite' e retorna 'ja_processado' sem duplicar o `charge`.
--
-- GRANT: PRIMEIRA RPC do projeto restrita a `service_role` (nunca
-- `authenticated`/`anon`/`PUBLIC`) — só a Edge Function `asaas-payment-webhook`
-- chama, autenticada pelo header `asaas-access-token` (AC2 da Story 7.5),
-- nunca por sessão de usuário logado. NÃO "corrigir" este GRANT numa Story
-- futura para incluir `authenticated` — seria uma regressão de segurança.
--
-- `p.id::text = p_external_reference` — comparação de TEXTO, nunca `::uuid`
-- no parâmetro: evita que um `externalReference` malformado vindo de fora
-- (payload de terceiro, teste manual) derrube a função com erro de cast; uma
-- comparação de texto que não bate simplesmente não encontra linha.
--
-- Depende de: 20260813004932 (pedidos, coluna status/pago_em/asaas_payment_id
-- via 20260814000004), 20260813050000 (lancamentos_financeiros).
--
-- ROLLBACK (forward-only; se necessário reverter):
--     DROP FUNCTION IF EXISTS public.confirmar_pagamento_pedido(text, text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirmar_pagamento_pedido(
  p_asaas_payment_id   text,
  p_external_reference text DEFAULT NULL
)
RETURNS TABLE (resultado text, pedido_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pedido_id uuid;
  v_status    text;
  v_estab_id  uuid;
  v_total     numeric(10,2);
BEGIN
  SELECT p.id, p.status, p.estabelecimento_id, p.total_pago_reais
    INTO v_pedido_id, v_status, v_estab_id, v_total
  FROM public.pedidos p
  WHERE p.asaas_payment_id = p_asaas_payment_id
     OR (p_external_reference IS NOT NULL AND p.id::text = p_external_reference)
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'pedido_nao_encontrado'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_status <> 'aguardando_pagamento' THEN
    RETURN QUERY SELECT 'ja_processado'::text, v_pedido_id;
    RETURN;
  END IF;

  UPDATE public.pedidos
  SET status = 'aguardando_aceite',
      pago_em = NOW(),
      asaas_payment_id = COALESCE(asaas_payment_id, p_asaas_payment_id)
  WHERE id = v_pedido_id;

  INSERT INTO public.lancamentos_financeiros (
    estabelecimento_id, pedido_id, tipo, valor_centavos, status, asaas_id_externo, detalhe
  )
  VALUES (
    v_estab_id, v_pedido_id, 'charge',
    (ROUND(COALESCE(v_total, 0) * 100))::bigint,
    'concluido', p_asaas_payment_id,
    'Pagamento PIX confirmado via webhook Asaas (PAYMENT_RECEIVED/PAYMENT_CONFIRMED).'
  );

  RETURN QUERY SELECT 'confirmado'::text, v_pedido_id;
END;
$$;

COMMENT ON FUNCTION public.confirmar_pagamento_pedido(text, text) IS
  'Story 7.5. Chamada SO pela Edge Function asaas-payment-webhook (service_role). '
  'Localiza o pedido por asaas_payment_id ou (fallback) id::text=external_reference, '
  'FOR UPDATE. status<>aguardando_pagamento -> ja_processado (idempotencia, IDEMP-001, '
  'sem novo UPDATE/INSERT). status=aguardando_pagamento -> UPDATE pedidos '
  '(aguardando_aceite, pago_em=now, backfill asaas_payment_id) + INSERT charge no ledger '
  '-> confirmado. HOJE DORMANT: criar_pedido ainda grava aguardando_aceite literal na '
  'criacao (nenhum pedido nasce em aguardando_pagamento) — ver docs/stories/7.5.story.md.';

-- PRIMEIRA RPC do projeto restrita a service_role (nunca authenticated/anon) —
-- só a Edge Function asaas-payment-webhook chama, autenticada pelo token do
-- Asaas (AC2), nunca por sessão de usuário.
REVOKE ALL ON FUNCTION public.confirmar_pagamento_pedido(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_pagamento_pedido(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.confirmar_pagamento_pedido(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_pagamento_pedido(text, text) TO service_role;
