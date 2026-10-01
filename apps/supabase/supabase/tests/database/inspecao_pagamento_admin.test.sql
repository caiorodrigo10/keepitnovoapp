BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(11);

SELECT has_function(
  'public', 'inspecionar_pagamento_admin', ARRAY['uuid']::text[],
  'RPC administrativa de inspeção financeira existe'
);

INSERT INTO auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
  ('78888888-0000-4000-8000-000000000001','authenticated','authenticated','cliente-inspecao@example.invalid','{}','{"nome":"Cliente"}'),
  ('78888888-0000-4000-8000-000000000002','authenticated','authenticated','lojista-inspecao@example.invalid','{}','{"role":"lojista"}'),
  ('78888888-0000-4000-8000-000000000003','authenticated','authenticated','admin-inspecao@example.invalid','{}','{}');
INSERT INTO public.admin_users (id,nome) VALUES ('78888888-0000-4000-8000-000000000003','Admin Inspeção');
INSERT INTO public.hubs (id,nome,endereco,lat,lng)
VALUES ('78888888-0000-4000-8000-000000000010','Hub Inspeção','Endereço',0,0);
INSERT INTO public.estabelecimentos (
  id,dono_user_id,nome_fantasia,cnpj,responsavel_nome,telefone,categoria,endereco,
  tempo_medio_entrega_min,taxa_deslocamento_reais,chave_pix,chave_pix_tipo,status
) VALUES (
  '78888888-0000-4000-8000-000000000020','78888888-0000-4000-8000-000000000002',
  'Loja Inspeção','78888888000100','Responsável','11999999999','farmacia','Endereço',
  10,5,'inspecao@example.invalid','email','ativo'
);
INSERT INTO public.pedidos (
  id,cliente_id,estabelecimento_id,hub_id,status,subtotal_produtos_reais,
  taxa_deslocamento_reais,taxa_keepit_reais,taxa_servico_comprador_reais,total_pago_reais,forma_pagamento,pago_em
) VALUES
  ('78888888-0000-4000-8000-000000000101','78888888-0000-4000-8000-000000000001','78888888-0000-4000-8000-000000000020','78888888-0000-4000-8000-000000000010','aguardando_pagamento',35,5,4.2,2.5,42.5,'pix',NULL),
  ('78888888-0000-4000-8000-000000000102','78888888-0000-4000-8000-000000000001','78888888-0000-4000-8000-000000000020','78888888-0000-4000-8000-000000000010','entregue',35,5,4.2,2.5,42.5,'cartao','2026-09-30T10:01:00Z'),
  ('78888888-0000-4000-8000-000000000103','78888888-0000-4000-8000-000000000001','78888888-0000-4000-8000-000000000020','78888888-0000-4000-8000-000000000010','aguardando_pagamento',35,5,4.2,2.5,42.5,'pix',NULL),
  ('78888888-0000-4000-8000-000000000104','78888888-0000-4000-8000-000000000001','78888888-0000-4000-8000-000000000020','78888888-0000-4000-8000-000000000010','aguardando_aceite',35,5,4.2,2.5,42.5,'pix','2026-09-30T10:03:00Z');
INSERT INTO public.tentativas_pagamento (
  id,pedido_id,cliente_id,operacao_id,forma,estado,asaas_payment_id,encerrada_em,reconciliacao_motivo,criado_em
) VALUES
  ('78888888-0000-4000-8000-000000000201','78888888-0000-4000-8000-000000000101','78888888-0000-4000-8000-000000000001','78888888-0000-4000-8000-000000000301','pix','pendente','pay-pendente',NULL,NULL,'2026-09-30T09:00:00Z'),
  ('78888888-0000-4000-8000-000000000202','78888888-0000-4000-8000-000000000102','78888888-0000-4000-8000-000000000001','78888888-0000-4000-8000-000000000302','cartao','recebido','pay-recebido',NULL,NULL,'2026-09-30T09:00:00Z'),
  ('78888888-0000-4000-8000-000000000203','78888888-0000-4000-8000-000000000104','78888888-0000-4000-8000-000000000001','78888888-0000-4000-8000-000000000303','pix','recebido','pay-a','2026-09-30T10:02:00Z',NULL,'2026-09-30T10:00:00Z'),
  ('78888888-0000-4000-8000-000000000204','78888888-0000-4000-8000-000000000104','78888888-0000-4000-8000-000000000001','78888888-0000-4000-8000-000000000304','pix','reconciliacao','pay-b',NULL,'pagamento_anterior_confirmado','2026-09-30T10:01:00Z');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','78888888-0000-4000-8000-000000000003',true);
SELECT is(
  public.inspecionar_pagamento_admin('78888888-0000-4000-8000-000000000101')->>'estado',
  'pendente', 'admin vê o estado real pendente'
);
SELECT is(
  public.inspecionar_pagamento_admin('78888888-0000-4000-8000-000000000101')->>'valorRecebidoReais',
  NULL, 'tentativa pendente não apresenta valor previsto como recebido'
);
SELECT is(
  (public.inspecionar_pagamento_admin('78888888-0000-4000-8000-000000000102')->>'valorRecebidoReais')::numeric,
  42.5::numeric, 'valor recebido só aparece com confirmação persistida'
);
SELECT is(
  public.inspecionar_pagamento_admin('78888888-0000-4000-8000-000000000104')->>'tentativaId',
  '78888888-0000-4000-8000-000000000203', 'pagamento efetivado aponta para a tentativa A'
);
SELECT is(
  public.inspecionar_pagamento_admin('78888888-0000-4000-8000-000000000104')->>'estado',
  'recebido', 'estado financeiro reflete A recebida, não B em reconciliação'
);
SELECT is(
  (public.inspecionar_pagamento_admin('78888888-0000-4000-8000-000000000104')->>'valorRecebidoReais')::numeric,
  42.5::numeric, 'valor recebido permanece associado ao pagamento A'
);
SELECT is(
  public.inspecionar_pagamento_admin('78888888-0000-4000-8000-000000000104')->'pendencia'->>'tentativaId',
  '78888888-0000-4000-8000-000000000204', 'tentativa B continua visível como pendência separada'
);
SELECT is(
  public.inspecionar_pagamento_admin('78888888-0000-4000-8000-000000000103'),
  NULL::jsonb, 'pedido sem tentativa retorna null'
);

SELECT set_config('request.jwt.claim.sub','78888888-0000-4000-8000-000000000001',true);
SELECT throws_ok(
  $$SELECT public.inspecionar_pagamento_admin('78888888-0000-4000-8000-000000000101')$$,
  'P0001', 'ACESSO_NEGADO', 'cliente não pode usar a inspeção administrativa'
);
SELECT is(
  (SELECT count(*)::integer FROM public.tentativas_pagamento
   WHERE pedido_id='78888888-0000-4000-8000-000000000101'),
  0, 'RLS não expõe linhas da tabela interna ao cliente'
);

SELECT * FROM finish();
ROLLBACK;
