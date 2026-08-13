import { businessConfig } from '@keepit/config';

import type { Pedido, PedidoItem } from '../../ports/order.port';

function minutosAtras(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function diasAtras(dias: number): string {
  return minutosAtras(dias * 24 * 60);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const TAXA_KEEPIT_PERCENT = 12;

function novoItem(pedidoId: string, index: number, nome: string, precoUnit: number, quantidade: number): PedidoItem {
  return {
    id: `${pedidoId}-item-${index}`,
    pedido_id: pedidoId,
    produto_id: null,
    nome_snapshot: nome,
    preco_unitario_reais: precoUnit,
    quantidade,
    subtotal_reais: round2(precoUnit * quantidade),
  };
}

type PedidoFixtureInput = Pick<Pedido, 'id' | 'numero' | 'cliente_id' | 'estabelecimento_id' | 'hub_id' | 'status' | 'itens'> &
  Partial<Pedido>;

function montarPedido(input: PedidoFixtureInput): Pedido {
  const subtotal = round2(input.itens.reduce((soma, item) => soma + item.subtotal_reais, 0));
  const taxaDeslocamento = input.taxa_deslocamento_reais ?? 4.9;
  const taxaKeepit = round2((subtotal * TAXA_KEEPIT_PERCENT) / 100);

  return {
    pin_texto: String(1000 + Math.floor(Math.random() * 9000)),
    tentativas_pin: 0,
    pin_bloqueado_ate: null,
    tempo_estimado_min: null,
    criado_em: new Date().toISOString(),
    aceito_em: null,
    saiu_hub_em: null,
    cliente_chegou_em: null,
    lojista_chegou_em: null,
    entregue_em: null,
    cancelado_em: null,
    subtotal_produtos_reais: subtotal,
    taxa_deslocamento_reais: taxaDeslocamento,
    taxa_keepit_reais: taxaKeepit,
    // Story 6.16 (AC1, AC3): campo que faltava no read model (ver
    // `Pedido.taxa_servico_comprador_reais`, `ports/order.port.ts`) — default
    // ao mesmo placeholder do checkout real (`businessConfig`), nunca 0
    // hard-coded, para exercitar a linha "Taxa de serviço" do Recibo.
    taxa_servico_comprador_reais: businessConfig.taxaServicoCompradorReais,
    total_pago_reais: round2(subtotal + taxaDeslocamento + businessConfig.taxaServicoCompradorReais),
    motivo_recusa: null,
    motivo_cancelamento: null,
    motivo_nao_retirado: null,
    forma_pagamento: 'pix',
    ...input,
  };
}

/**
 * Fixtures derivadas do protótipo — "Pedido #2048 · Farmácia Vida · R$ 68,30"
 * localizado via Grep no histórico de pedidos do cliente. O segundo pedido
 * (#2049) é uma fixture adicional em estado distinto (`aguardando_aceite`)
 * para exercitar as telas de acompanhamento (Story 0.7+).
 */
export const pedidosFixture: Pedido[] = [
  {
    id: 'pedido-2048',
    numero: 2048,
    cliente_id: 'cliente-ana',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'entregue',
    pin_texto: '4821',
    tentativas_pin: 1,
    pin_bloqueado_ate: null,
    tempo_estimado_min: 20,
    criado_em: '2026-07-10T14:00:00.000Z',
    aceito_em: '2026-07-10T14:02:00.000Z',
    saiu_hub_em: '2026-07-10T14:20:00.000Z',
    cliente_chegou_em: '2026-07-10T14:35:00.000Z',
    lojista_chegou_em: '2026-07-10T14:33:00.000Z',
    entregue_em: '2026-07-10T14:36:00.000Z',
    cancelado_em: null,
    subtotal_produtos_reais: 68.3,
    taxa_deslocamento_reais: 4.9,
    taxa_keepit_reais: 8.2, // 12% de 68.30, arredondado
    // Story 6.16: 0 preserva o total_pago_reais original (68.3 + 4.9 =
    // 73.2) sem taxa de serviço — exercita o ramo "linha oculta" do Recibo
    // (AC3: só mostra "Taxa de serviço" quando > 0).
    taxa_servico_comprador_reais: 0,
    total_pago_reais: 73.2,
    motivo_recusa: null,
    motivo_cancelamento: null,
    motivo_nao_retirado: null,
    forma_pagamento: 'pix',
    itens: [
      {
        id: 'pedido-2048-item-1',
        pedido_id: 'pedido-2048',
        produto_id: 'produto-multivitaminico',
        nome_snapshot: 'Multivitamínico Adulto',
        preco_unitario_reais: 68.3,
        quantidade: 1,
        subtotal_reais: 68.3,
      },
    ],
  },
  {
    id: 'pedido-2049',
    numero: 2049,
    cliente_id: 'cliente-ana',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'aguardando_aceite',
    pin_texto: '7734',
    tentativas_pin: 0,
    pin_bloqueado_ate: null,
    tempo_estimado_min: null,
    criado_em: '2026-07-27T18:00:00.000Z',
    aceito_em: null,
    saiu_hub_em: null,
    cliente_chegou_em: null,
    lojista_chegou_em: null,
    entregue_em: null,
    cancelado_em: null,
    subtotal_produtos_reais: 54.8,
    taxa_deslocamento_reais: 4.9,
    taxa_keepit_reais: 6.58, // 12% de 54.80, arredondado
    // Story 6.16: 0 preserva o total_pago_reais original (54.8 + 4.9 =
    // 59.7) — mesmo racional do pedido-2048 acima.
    taxa_servico_comprador_reais: 0,
    total_pago_reais: 59.7,
    motivo_recusa: null,
    motivo_cancelamento: null,
    motivo_nao_retirado: null,
    forma_pagamento: 'cartao',
    itens: [
      {
        id: 'pedido-2049-item-1',
        pedido_id: 'pedido-2049',
        produto_id: 'produto-dipirona',
        nome_snapshot: 'Dipirona Monoidratada 500mg',
        preco_unitario_reais: 14.9,
        quantidade: 1,
        subtotal_reais: 14.9,
      },
      {
        id: 'pedido-2049-item-2',
        pedido_id: 'pedido-2049',
        produto_id: 'produto-protetor-solar',
        nome_snapshot: 'Protetor Solar FPS 60',
        preco_unitario_reais: 39.9,
        quantidade: 1,
        subtotal_reais: 39.9,
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Pedidos promovidos de `apps/lojista/src/screens/pedidos/lojistaOrders.mock.ts`
  // (`criarPedidosFixture`, Story 0.10) — Story 1.10 (Task 1). Mesmos ids
  // `lj-pedido-*`, mesma loja (`estab-farmacia-vida`) e hub (`hub-centro`)
  // do restante das fixtures reais — apenas os clientes usam os ids
  // `lj-cliente-*` promovidos em `clientes.ts`.
  // ---------------------------------------------------------------------
  montarPedido({
    id: 'lj-pedido-2049',
    numero: 20049,
    cliente_id: 'lj-cliente-bruno',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'aguardando_aceite',
    criado_em: minutosAtras(2),
    itens: [novoItem('lj-pedido-2049', 1, 'Álcool em gel 70%', 32, 1)],
  }),
  montarPedido({
    id: 'lj-pedido-2048',
    numero: 20048,
    cliente_id: 'lj-cliente-thiago',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'em_preparo',
    criado_em: minutosAtras(5),
    aceito_em: minutosAtras(4),
    tempo_estimado_min: 20,
    itens: [
      novoItem('lj-pedido-2048', 1, 'Protetor solar FPS 50', 39.9, 1),
      novoItem('lj-pedido-2048', 2, 'Vitamina C 1g', 28.4, 1),
    ],
  }),
  montarPedido({
    id: 'lj-pedido-2047',
    numero: 20047,
    cliente_id: 'lj-cliente-marina',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'em_preparo',
    criado_em: minutosAtras(18),
    aceito_em: minutosAtras(17),
    tempo_estimado_min: 25,
    itens: [
      novoItem('lj-pedido-2047', 1, 'Álcool em gel 70%', 32, 1),
      novoItem('lj-pedido-2047', 2, 'Máscara facial', 15, 1),
      novoItem('lj-pedido-2047', 3, 'Sabonete líquido', 20.4, 1),
      novoItem('lj-pedido-2047', 4, 'Repelente spray', 25, 1),
    ],
  }),
  montarPedido({
    id: 'lj-pedido-2045',
    numero: 20045,
    cliente_id: 'lj-cliente-rafael',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'no_hub',
    criado_em: minutosAtras(40),
    aceito_em: minutosAtras(38),
    saiu_hub_em: minutosAtras(20),
    lojista_chegou_em: minutosAtras(5),
    tempo_estimado_min: 15,
    pin_texto: '4567',
    itens: [novoItem('lj-pedido-2045', 1, 'Termômetro digital', 45, 1)],
  }),
  montarPedido({
    id: 'lj-pedido-2040',
    numero: 20040,
    cliente_id: 'lj-cliente-julia',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'entregue',
    criado_em: minutosAtras(240),
    aceito_em: minutosAtras(238),
    saiu_hub_em: minutosAtras(225),
    lojista_chegou_em: minutosAtras(215),
    cliente_chegou_em: minutosAtras(212),
    entregue_em: minutosAtras(210),
    itens: [novoItem('lj-pedido-2040', 1, 'Multivitamínico Adulto', 54.9, 1)],
  }),
  montarPedido({
    id: 'lj-pedido-2039',
    numero: 20039,
    cliente_id: 'lj-cliente-carla',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'recusado',
    criado_em: minutosAtras(300),
    motivo_recusa: 'Item sem estoque no momento.',
    itens: [novoItem('lj-pedido-2039', 1, 'Repelente spray', 25, 2)],
  }),
  montarPedido({
    id: 'lj-pedido-2038',
    numero: 20038,
    cliente_id: 'lj-cliente-bruno',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'nao_retirado',
    criado_em: minutosAtras(1440),
    aceito_em: minutosAtras(1438),
    saiu_hub_em: minutosAtras(1420),
    lojista_chegou_em: minutosAtras(1410),
    motivo_nao_retirado: 'Cliente não compareceu dentro da janela de tolerância do hub.',
    itens: [novoItem('lj-pedido-2038', 1, 'Álcool em gel 70%', 32, 1)],
  }),

  // ---------------------------------------------------------------------
  // Histórico "entregue" adicional para `estab-farmacia-vida` — Story 1.10
  // (Task 7), garante que os períodos maiores (30d/90d/1a) de
  // `analytics.port.salesSummary`/`topProducts` não fiquem vazios só por
  // falta de dado de fixture.
  // ---------------------------------------------------------------------
  montarPedido({
    id: 'lj-pedido-hist-20d',
    numero: 20100,
    cliente_id: 'lj-cliente-marina',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'entregue',
    criado_em: diasAtras(20),
    aceito_em: diasAtras(20),
    saiu_hub_em: diasAtras(20),
    lojista_chegou_em: diasAtras(20),
    cliente_chegou_em: diasAtras(20),
    entregue_em: diasAtras(20),
    itens: [novoItem('lj-pedido-hist-20d', 1, 'Protetor solar FPS 50', 39.9, 2)],
  }),
  montarPedido({
    id: 'lj-pedido-hist-45d',
    numero: 20101,
    cliente_id: 'lj-cliente-rafael',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'entregue',
    criado_em: diasAtras(45),
    aceito_em: diasAtras(45),
    saiu_hub_em: diasAtras(45),
    lojista_chegou_em: diasAtras(45),
    cliente_chegou_em: diasAtras(45),
    entregue_em: diasAtras(45),
    itens: [novoItem('lj-pedido-hist-45d', 1, 'Vitamina C 1g', 28.4, 3)],
  }),
  montarPedido({
    id: 'lj-pedido-hist-75d',
    numero: 20102,
    cliente_id: 'lj-cliente-thiago',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'entregue',
    criado_em: diasAtras(75),
    aceito_em: diasAtras(75),
    saiu_hub_em: diasAtras(75),
    lojista_chegou_em: diasAtras(75),
    cliente_chegou_em: diasAtras(75),
    entregue_em: diasAtras(75),
    itens: [novoItem('lj-pedido-hist-75d', 1, 'Álcool em gel 70%', 32, 4)],
  }),
  montarPedido({
    id: 'lj-pedido-hist-200d',
    numero: 20103,
    cliente_id: 'lj-cliente-julia',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'entregue',
    criado_em: diasAtras(200),
    aceito_em: diasAtras(200),
    saiu_hub_em: diasAtras(200),
    lojista_chegou_em: diasAtras(200),
    cliente_chegou_em: diasAtras(200),
    entregue_em: diasAtras(200),
    itens: [novoItem('lj-pedido-hist-200d', 1, 'Multivitamínico Adulto', 54.9, 2)],
  }),
  montarPedido({
    id: 'lj-pedido-hist-330d',
    numero: 20104,
    cliente_id: 'lj-cliente-carla',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'entregue',
    criado_em: diasAtras(330),
    aceito_em: diasAtras(330),
    saiu_hub_em: diasAtras(330),
    lojista_chegou_em: diasAtras(330),
    cliente_chegou_em: diasAtras(330),
    entregue_em: diasAtras(330),
    itens: [novoItem('lj-pedido-hist-330d', 1, 'Protetor solar FPS 50', 39.9, 1)],
  }),

  // ---------------------------------------------------------------------
  // Pedidos promovidos de `apps/admin/src/mock/adminOpsFixtures.ts`
  // (`pedidosOpsFixture`, Story 0.13) — Story 1.10 (Task 4). `hub-jardins`/
  // `hub-vila-nova` e `estab-bem-vestir`/`estab-conveniencia-24h`/
  // `estab-mercadinho-noturno` já existem nas fixtures reais.
  // ---------------------------------------------------------------------
  {
    id: 'pedido-ops-3001',
    numero: 3001,
    cliente_id: 'cliente-ana',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'entregue',
    pin_texto: '1123',
    tentativas_pin: 1,
    pin_bloqueado_ate: null,
    tempo_estimado_min: 20,
    criado_em: '2026-07-25T13:00:00.000Z',
    aceito_em: '2026-07-25T13:02:00.000Z',
    saiu_hub_em: '2026-07-25T13:20:00.000Z',
    cliente_chegou_em: '2026-07-25T13:34:00.000Z',
    lojista_chegou_em: '2026-07-25T13:32:00.000Z',
    entregue_em: '2026-07-25T13:35:00.000Z',
    cancelado_em: null,
    subtotal_produtos_reais: 42.0,
    taxa_deslocamento_reais: 4.9,
    taxa_keepit_reais: 5.04,
    taxa_servico_comprador_reais: 0, // Story 6.16: preserva total_pago_reais original (42.0 + 4.9 = 46.9)
    total_pago_reais: 46.9,
    motivo_recusa: null,
    motivo_cancelamento: null,
    motivo_nao_retirado: null,
    forma_pagamento: 'pix',
    itens: [
      {
        id: 'pedido-ops-3001-item-1',
        pedido_id: 'pedido-ops-3001',
        produto_id: 'produto-multivitaminico',
        nome_snapshot: 'Multivitamínico Adulto',
        preco_unitario_reais: 42.0,
        quantidade: 1,
        subtotal_reais: 42.0,
      },
    ],
  },
  {
    id: 'pedido-ops-3002',
    numero: 3002,
    cliente_id: 'cliente-carla',
    estabelecimento_id: 'estab-bem-vestir',
    hub_id: 'hub-jardins',
    status: 'entregue',
    pin_texto: '2244',
    tentativas_pin: 0,
    pin_bloqueado_ate: null,
    tempo_estimado_min: 30,
    criado_em: '2026-06-01T10:00:00.000Z',
    aceito_em: '2026-06-01T10:03:00.000Z',
    saiu_hub_em: '2026-06-01T10:30:00.000Z',
    cliente_chegou_em: '2026-06-01T10:45:00.000Z',
    lojista_chegou_em: '2026-06-01T10:43:00.000Z',
    entregue_em: '2026-06-01T10:46:00.000Z',
    cancelado_em: null,
    subtotal_produtos_reais: 120.0,
    taxa_deslocamento_reais: 5.9,
    taxa_keepit_reais: 14.4,
    taxa_servico_comprador_reais: 0, // Story 6.16: preserva total_pago_reais original (120.0 + 5.9 = 125.9)
    total_pago_reais: 125.9,
    motivo_recusa: null,
    motivo_cancelamento: null,
    motivo_nao_retirado: null,
    forma_pagamento: 'cartao',
    itens: [
      {
        id: 'pedido-ops-3002-item-1',
        pedido_id: 'pedido-ops-3002',
        produto_id: 'produto-camiseta-basica',
        nome_snapshot: 'Camiseta Casual',
        preco_unitario_reais: 120.0,
        quantidade: 1,
        subtotal_reais: 120.0,
      },
    ],
  },
  {
    id: 'pedido-ops-3003',
    numero: 3003,
    cliente_id: 'cliente-diego',
    estabelecimento_id: 'estab-conveniencia-24h',
    hub_id: 'hub-centro',
    status: 'aguardando_aceite',
    pin_texto: '3355',
    tentativas_pin: 0,
    pin_bloqueado_ate: null,
    tempo_estimado_min: null,
    criado_em: diasAtras(1),
    aceito_em: null,
    saiu_hub_em: null,
    cliente_chegou_em: null,
    lojista_chegou_em: null,
    entregue_em: null,
    cancelado_em: null,
    subtotal_produtos_reais: 25.5,
    taxa_deslocamento_reais: 3.5,
    taxa_keepit_reais: 3.06,
    taxa_servico_comprador_reais: 0, // Story 6.16: preserva total_pago_reais original (25.5 + 3.5 = 29.0)
    total_pago_reais: 29.0,
    motivo_recusa: null,
    motivo_cancelamento: null,
    motivo_nao_retirado: null,
    forma_pagamento: 'pix',
    itens: [
      {
        id: 'pedido-ops-3003-item-1',
        pedido_id: 'pedido-ops-3003',
        produto_id: 'produto-agua-mineral',
        nome_snapshot: 'Água Mineral 1,5L',
        preco_unitario_reais: 8.5,
        quantidade: 3,
        subtotal_reais: 25.5,
      },
    ],
  },
  {
    id: 'pedido-ops-3004',
    numero: 3004,
    cliente_id: 'cliente-bruno',
    estabelecimento_id: 'estab-mercadinho-noturno',
    hub_id: 'hub-vila-nova',
    status: 'cancelado_admin',
    pin_texto: '4466',
    tentativas_pin: 0,
    pin_bloqueado_ate: null,
    tempo_estimado_min: null,
    criado_em: '2026-07-20T20:00:00.000Z',
    aceito_em: '2026-07-20T20:03:00.000Z',
    saiu_hub_em: null,
    cliente_chegou_em: null,
    lojista_chegou_em: null,
    entregue_em: null,
    cancelado_em: '2026-07-21T09:00:00.000Z',
    subtotal_produtos_reais: 60.0,
    taxa_deslocamento_reais: 4.5,
    taxa_keepit_reais: 7.2,
    taxa_servico_comprador_reais: 0, // Story 6.16: preserva total_pago_reais original (60.0 + 4.5 = 64.5)
    total_pago_reais: 64.5,
    motivo_recusa: null,
    motivo_cancelamento: 'Lojista suspenso por reincidência de chargeback — pedido cancelado de ofício pelo admin.',
    motivo_nao_retirado: null,
    forma_pagamento: 'cartao',
    itens: [
      {
        id: 'pedido-ops-3004-item-1',
        pedido_id: 'pedido-ops-3004',
        produto_id: null,
        nome_snapshot: 'Cesta de itens diversos',
        preco_unitario_reais: 60.0,
        quantidade: 1,
        subtotal_reais: 60.0,
      },
    ],
  },
  {
    id: 'pedido-ops-3005',
    numero: 3005,
    cliente_id: 'cliente-ana',
    estabelecimento_id: 'estab-farmacia-vida',
    hub_id: 'hub-centro',
    status: 'aceito',
    pin_texto: '5577',
    tentativas_pin: 0,
    pin_bloqueado_ate: null,
    tempo_estimado_min: 25,
    criado_em: diasAtras(2),
    aceito_em: diasAtras(2),
    saiu_hub_em: null,
    cliente_chegou_em: null,
    lojista_chegou_em: null,
    entregue_em: null,
    cancelado_em: null,
    subtotal_produtos_reais: 18.9,
    taxa_deslocamento_reais: 4.9,
    taxa_keepit_reais: 2.27,
    taxa_servico_comprador_reais: 0, // Story 6.16: preserva total_pago_reais original (18.9 + 4.9 = 23.8)
    total_pago_reais: 23.8,
    motivo_recusa: null,
    motivo_cancelamento: null,
    motivo_nao_retirado: null,
    forma_pagamento: 'pix',
    itens: [
      {
        id: 'pedido-ops-3005-item-1',
        pedido_id: 'pedido-ops-3005',
        produto_id: 'produto-dipirona',
        nome_snapshot: 'Dipirona Monoidratada 500mg',
        preco_unitario_reais: 18.9,
        quantidade: 1,
        subtotal_reais: 18.9,
      },
    ],
  },
];
