import type { EstabelecimentoFalha } from '../../ports/admin.port';

/**
 * Fixtures promovidas de `apps/admin/src/mock/adminOpsFixtures.ts`
 * (`estabelecimentosFalhasOpsFixture`, Story 0.13) — Story 1.10 (Task 4).
 * >=2 falhas para `estab-mercadinho-noturno` (o lojista suspenso).
 */
export const estabelecimentosFalhasFixture: EstabelecimentoFalha[] = [
  {
    id: 'falha-ops-1',
    estabelecimento_id: 'estab-mercadinho-noturno',
    pedido_id: null,
    tipo: 'chargeback',
    detalhes: 'Chargeback confirmado pela adquirente em pedido de 2026-07-15.',
    criado_em: '2026-07-16T10:00:00.000Z',
  },
  {
    id: 'falha-ops-2',
    estabelecimento_id: 'estab-mercadinho-noturno',
    pedido_id: null,
    tipo: 'reclamacao_admin',
    detalhes: 'Cliente relatou item errado entregue no hub, sem resposta do lojista.',
    criado_em: '2026-07-18T14:30:00.000Z',
  },
  {
    id: 'falha-ops-3',
    estabelecimento_id: 'estab-mercadinho-noturno',
    pedido_id: 'pedido-ops-3004',
    tipo: 'lojista_nao_apareceu',
    detalhes: 'Lojista não compareceu ao hub no horário combinado — pedido cancelado pelo admin.',
    criado_em: '2026-07-21T08:30:00.000Z',
  },
];
