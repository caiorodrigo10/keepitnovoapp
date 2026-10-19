BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_table('public', 'produto_complemento_grupos', 'grupos de complementos existem');
SELECT has_table('public', 'produto_complemento_itens', 'itens de complementos existem');
SELECT has_column('public', 'pedidos_itens', 'complementos_snapshot', 'pedido conserva snapshot dos complementos');
SELECT has_function('public', 'salvar_produto_complementos', ARRAY['uuid','jsonb','jsonb'], 'catalogo atomico de complementos');

INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data) VALUES
  ('71800000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'comp-cliente@example.invalid', '{"nome":"Cliente complementos"}'),
  ('71800000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'comp-lojista@example.invalid', '{"role":"lojista"}');
INSERT INTO public.hubs (id, nome, endereco, lat, lng)
VALUES ('71800000-0000-4000-8000-000000000010', 'Hub complementos', 'Endereço', 0, 0);
INSERT INTO public.hubs_horarios (hub_id, dia_semana, aberto, hora_abre, hora_fecha)
SELECT '71800000-0000-4000-8000-000000000010', dia, true, '00:00', '24:00' FROM generate_series(0, 6) dia;
INSERT INTO public.estabelecimentos (id, dono_user_id, nome_fantasia, cnpj, responsavel_nome, telefone, categoria, endereco, tempo_medio_entrega_min, taxa_deslocamento_reais, ticket_minimo_reais, chave_pix, chave_pix_tipo, status)
VALUES ('71800000-0000-4000-8000-000000000020', '71800000-0000-4000-8000-000000000002', 'Loja complementos', '71800000000199', 'Lojista', '11999999999', 'farmacia', 'Endereço', 10, 0, 1, 'comp-loja@example.invalid', 'email', 'ativo');
INSERT INTO public.estabelecimentos_horarios (estabelecimento_id, dia_semana, aberto, hora_abre, hora_fecha)
SELECT '71800000-0000-4000-8000-000000000020', dia, true, '00:00', '24:00' FROM generate_series(0, 6) dia;
INSERT INTO public.estabelecimentos_hubs (estabelecimento_id, hub_id)
VALUES ('71800000-0000-4000-8000-000000000020', '71800000-0000-4000-8000-000000000010');
INSERT INTO public.produtos (id, estabelecimento_id, nome, preco_reais, categoria_produto)
VALUES ('71800000-0000-4000-8000-000000000030', '71800000-0000-4000-8000-000000000020', 'Produto com complementos', 10, 'cuidados');
INSERT INTO public.produto_complemento_grupos (id, produto_id, nome, tipo, min_selecoes, max_selecoes, ordem) VALUES
  ('71800000-0000-4000-8000-000000000041', '71800000-0000-4000-8000-000000000030', 'Tamanho', 'unica', 1, 1, 0),
  ('71800000-0000-4000-8000-000000000042', '71800000-0000-4000-8000-000000000030', 'Adicionais', 'multipla', 0, 2, 1);
INSERT INTO public.produto_complemento_itens (id, grupo_id, nome, preco_extra_reais, ordem) VALUES
  ('71800000-0000-4000-8000-000000000051', '71800000-0000-4000-8000-000000000041', 'Grande', 4, 0),
  ('71800000-0000-4000-8000-000000000052', '71800000-0000-4000-8000-000000000042', 'Bacon', 5, 0);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71800000-0000-4000-8000-000000000001', true);
SELECT set_config('test.cotacao_complementos', (
  public.cotar_pedido(
    '71800000-0000-4000-8000-000000000020',
    '71800000-0000-4000-8000-000000000010',
    '[{"produtoId":"71800000-0000-4000-8000-000000000030","quantidade":1,"complementoIds":["71800000-0000-4000-8000-000000000052","71800000-0000-4000-8000-000000000051"]}]'::jsonb
  ) ->> 'id'
), true);
SELECT set_config('test.pedido_complementos', (
  public.criar_pedido_cotado(current_setting('test.cotacao_complementos')::uuid, 'pix', false, '71800000-0000-4000-8000-000000000060') ->> 'pedidoId'
), true);
RESET ROLE;

SELECT ok(
  (
    SELECT complementos_snapshot = jsonb_build_array(
      jsonb_build_object('grupoId', '71800000-0000-4000-8000-000000000041', 'grupoNome', 'Tamanho', 'itemId', '71800000-0000-4000-8000-000000000051', 'itemNome', 'Grande', 'precoExtraCentavos', 400),
      jsonb_build_object('grupoId', '71800000-0000-4000-8000-000000000042', 'grupoNome', 'Adicionais', 'itemId', '71800000-0000-4000-8000-000000000052', 'itemNome', 'Bacon', 'precoExtraCentavos', 500)
    )
    FROM public.pedidos_itens
    WHERE pedido_id = current_setting('test.pedido_complementos')::uuid
  ),
  'cotação e criação persistem IDs, grupos, nomes, preços e ordem do snapshot'
);

SELECT * FROM finish();
ROLLBACK;
