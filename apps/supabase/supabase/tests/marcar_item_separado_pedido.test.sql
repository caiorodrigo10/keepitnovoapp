-- Requer migrations aplicadas em um banco efêmero de testes; este arquivo não
-- aplica migrations nem toca em keepit-dev.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(1);

INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'separacao-cliente@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{"nome":"Cliente separacao"}'::jsonb, now(), now()),
  ('b2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'separacao-lojista@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{"nome":"Lojista separacao"}'::jsonb, now(), now());

INSERT INTO public.hubs (id, nome, endereco, lat, lng, ativo)
VALUES ('c3333333-3333-4333-8333-333333333333', 'Hub de teste', 'Endereço de teste', -19.9, -43.9, true);

INSERT INTO public.estabelecimentos (
  id, dono_user_id, nome_fantasia, cnpj, responsavel_nome, telefone, categoria,
  endereco, tempo_medio_entrega_min, chave_pix, chave_pix_tipo, status
)
VALUES (
  'd4444444-4444-4444-8444-444444444444', 'b2222222-2222-4222-8222-222222222222',
  'Loja de teste', '99111111000199', 'Responsável de teste', '+5531999999999', 'farmacia',
  'Endereço de teste', 20, 'separacao-loja@example.invalid', 'email', 'ativo'
);

INSERT INTO public.pedidos (
  id, cliente_id, estabelecimento_id, hub_id, status, pin_hash, pin_texto,
  subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais, total_pago_reais
)
VALUES (
  'e5555555-5555-4555-8555-555555555555', 'a1111111-1111-4111-8111-111111111111',
  'd4444444-4444-4444-8444-444444444444', 'c3333333-3333-4333-8333-333333333333', 'aguardando_aceite',
  'hash-de-teste', '0000', 10, 0, 0, 10
);

INSERT INTO public.pedidos_itens (
  id, pedido_id, nome_snapshot, preco_unitario_reais, quantidade, subtotal_reais
)
VALUES ('f6666666-6666-4666-8666-666666666666', 'e5555555-5555-4555-8555-555555555555', 'Item de teste', 10, 1, 10);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);

DO $$
DECLARE
  v_pedido_id uuid;
  v_separado boolean;
  v_separado_em timestamptz;
  v_rows bigint;
BEGIN
  SELECT public.marcar_item_separado_pedido('f6666666-6666-4666-8666-666666666666', true) INTO v_pedido_id;
  IF v_pedido_id <> 'e5555555-5555-4555-8555-555555555555'::uuid THEN
    RAISE EXCEPTION 'RPC retornou pedido_id inesperado: %', v_pedido_id;
  END IF;

  SELECT separado, separado_em INTO v_separado, v_separado_em
  FROM public.pedidos_itens WHERE id = 'f6666666-6666-4666-8666-666666666666';
  IF v_separado IS DISTINCT FROM true OR v_separado_em IS NULL THEN
    RAISE EXCEPTION 'RPC não persistiu separado=true com separado_em';
  END IF;

  UPDATE public.pedidos_itens SET separado = false
  WHERE id = 'f6666666-6666-4666-8666-666666666666';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'UPDATE direto não deveria atualizar pedidos_itens';
  END IF;

  PERFORM public.marcar_item_separado_pedido('f6666666-6666-4666-8666-666666666666', false);
  SELECT separado, separado_em INTO v_separado, v_separado_em
  FROM public.pedidos_itens WHERE id = 'f6666666-6666-4666-8666-666666666666';
  IF v_separado IS DISTINCT FROM false OR v_separado_em IS NOT NULL THEN
    RAISE EXCEPTION 'RPC não persistiu separado=false com separado_em nulo';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public.pedidos SET status = 'no_hub' WHERE id = 'e5555555-5555-4555-8555-555555555555';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);

DO $$
BEGIN
  PERFORM public.marcar_item_separado_pedido('f6666666-6666-4666-8666-666666666666', true);
  RAISE EXCEPTION 'RPC deveria rejeitar status final/de hub';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ESTADO_INVALIDO%' THEN
      RAISE;
    END IF;
END;
$$;

RESET ROLE;
SELECT extensions.ok(true, 'RPC de separação persiste checklist sem liberar UPDATE direto');
SELECT * FROM extensions.finish(NULL);
ROLLBACK;
