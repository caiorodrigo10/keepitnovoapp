import type { Cliente } from '../../ports/auth.port';

/**
 * Fixture mínima viável — cliente único do protótipo (nenhum nome de cliente
 * é exibido explicitamente no `keepit-app/index.html`; telefone/CPF são
 * dados sintéticos para popular o mock).
 */
export const clientesFixture: Cliente[] = [
  {
    id: 'cliente-ana',
    nome: 'Ana Souza',
    telefone: '+5511987654321',
    telefone_confirmado: true,
    cpf: null,
    bloqueado: false,
    motivo_bloqueio: null,
    criado_em: '2026-06-01T12:00:00.000Z',
  },
  // Clientes promovidos de `apps/lojista/src/screens/pedidos/lojistaOrders.mock.ts`
  // (`CLIENTE_NOME_POR_ID`, Story 0.10) — Story 1.10 (Task 3). Mesmos ids já
  // referenciados pelos pedidos fixture do Lojista (`lj-pedido-*`).
  {
    id: 'lj-cliente-thiago',
    nome: 'Thiago F.',
    telefone: '+5511911111111',
    telefone_confirmado: true,
    cpf: null,
    bloqueado: false,
    motivo_bloqueio: null,
    criado_em: '2026-05-01T10:00:00.000Z',
  },
  {
    id: 'lj-cliente-marina',
    nome: 'Marina S.',
    telefone: '+5511922222222',
    telefone_confirmado: true,
    cpf: null,
    bloqueado: false,
    motivo_bloqueio: null,
    criado_em: '2026-05-02T10:00:00.000Z',
  },
  {
    id: 'lj-cliente-rafael',
    nome: 'Rafael T.',
    telefone: '+5511933333333',
    telefone_confirmado: true,
    cpf: null,
    bloqueado: false,
    motivo_bloqueio: null,
    criado_em: '2026-05-03T10:00:00.000Z',
  },
  {
    id: 'lj-cliente-bruno',
    nome: 'Bruno L.',
    telefone: '+5511944444444',
    telefone_confirmado: true,
    cpf: null,
    bloqueado: false,
    motivo_bloqueio: null,
    criado_em: '2026-05-04T10:00:00.000Z',
  },
  {
    id: 'lj-cliente-julia',
    nome: 'Júlia P.',
    telefone: '+5511955555555',
    telefone_confirmado: true,
    cpf: null,
    bloqueado: false,
    motivo_bloqueio: null,
    criado_em: '2026-05-05T10:00:00.000Z',
  },
  {
    id: 'lj-cliente-carla',
    nome: 'Carla M.',
    telefone: '+5511966666666',
    telefone_confirmado: true,
    cpf: null,
    bloqueado: false,
    motivo_bloqueio: null,
    criado_em: '2026-05-06T10:00:00.000Z',
  },
  // Clientes promovidos de `apps/admin/src/mock/adminOpsFixtures.ts`
  // (`clientesOpsFixture`, Story 0.13) — Story 1.10 (Task 4). Ids distintos
  // dos `lj-cliente-*` acima (datasets de origem diferentes).
  {
    id: 'cliente-bruno',
    nome: 'Bruno Lima',
    telefone: '+5511976543210',
    telefone_confirmado: true,
    cpf: null,
    bloqueado: true,
    motivo_bloqueio: 'Reincidência em não retirar pedidos (2 pedidos marcados nao_retirado_cliente).',
    criado_em: '2026-06-05T09:30:00.000Z',
  },
  {
    id: 'cliente-carla',
    nome: 'Carla Mendes',
    telefone: '+5511965432109',
    telefone_confirmado: true,
    cpf: null,
    bloqueado: false,
    motivo_bloqueio: null,
    criado_em: '2026-06-12T15:10:00.000Z',
  },
  {
    id: 'cliente-diego',
    nome: 'Diego Alves',
    telefone: '+5511954321098',
    telefone_confirmado: true,
    cpf: null,
    bloqueado: false,
    motivo_bloqueio: null,
    criado_em: '2026-06-20T18:45:00.000Z',
  },
];
