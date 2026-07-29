import type { ReembolsoPendente } from '../../ports/admin.port';

/**
 * Fixtures promovidas de `apps/admin/src/mock/adminOpsFixtures.ts`
 * (`reembolsosOpsFixture`, Story 0.13) — Story 1.10 (Task 4). Seedadas em
 * `db.reembolsos` (ver `mock/db.ts`) para a tela "Fila de reembolsos" do
 * Admin não nascer vazia — as demais entradas (a partir da Story 1.10 em
 * diante) são populadas organicamente pelas transições de
 * cancelamento/recusa/no-show (ver `mock/refund-helpers.ts`).
 */
export const reembolsosFixture: ReembolsoPendente[] = [
  {
    id: 'reembolso-ops-1',
    pedido_id: 'pedido-ops-3003',
    motivo: 'timeout_aceite',
    valor_a_estornar_reais: 29.0,
    valor_ao_lojista_reais: 0,
    forma_pagamento: 'pix',
    status: 'pendente_admin',
    criado_em: '2026-07-26T09:00:00.000Z',
  },
  {
    id: 'reembolso-ops-2',
    pedido_id: 'pedido-ops-3005',
    motivo: 'nao_entregue_lojista',
    valor_a_estornar_reais: 23.8,
    valor_ao_lojista_reais: 0,
    forma_pagamento: 'pix',
    status: 'pendente_admin',
    criado_em: '2026-07-27T15:00:00.000Z',
  },
  {
    id: 'reembolso-ops-3',
    pedido_id: 'pedido-ops-3002',
    motivo: 'cancelamento_cliente_pos_aceite',
    valor_a_estornar_reais: 125.9,
    valor_ao_lojista_reais: 0,
    forma_pagamento: 'cartao',
    status: 'estornado',
    criado_em: '2026-06-01T18:00:00.000Z',
  },
];
