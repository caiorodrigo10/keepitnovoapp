import { describe, expect, it } from 'vitest';
import { createMockDb } from './db';
import {
  CLIENTE_MOCK_SCHEMA_VERSION,
  applyClienteSnapshot,
  createClienteBaseline,
  decodeClienteSnapshot,
  parseClienteSnapshot,
} from './cliente-state';

type SnapshotCorruption = {
  delays?: NonNullable<ReturnType<typeof createClienteBaseline>['qa']['orderProgressionDelaysMs']>;
  anchor?: string;
  orderId?: string;
};

const invalidCurrentCases: Array<[string, SnapshotCorruption]> = [
  ['atraso negativo', { delays: { aceito: -1, em_preparo: 1, saindo_hub: 1, no_hub: 1 } }],
  ['atraso não finito', { delays: { aceito: 1e999, em_preparo: 1, saindo_hub: 1, no_hub: 1 } }],
  ['âncora inválida', { anchor: 'não-é-uma-data' }],
  ['pedido inexistente', { orderId: 'pedido-ausente' }],
];

describe('cliente-state', () => {
  it('cria baseline com conta demo, mas sem dados de uso do Cliente', () => {
    const state = createClienteBaseline();
    expect(state).toMatchObject({
      schemaVersion: CLIENTE_MOCK_SCHEMA_VERSION,
      sessionClienteId: null,
      selectedHubId: null,
      favoriteHubIdsByClienteId: {},
      favoriteStoreIdsByClienteId: {},
      orders: [],
      orderAutomation: {},
      passwordRecovery: null,
      accountDeletionsByClienteId: {},
      qa: { clockOffsetMs: 0, autoProgressOrders: false, orderProgressionDelaysMs: null },
    });
    expect(state.accounts).toEqual([
      expect.objectContaining({ id: 'cliente-ana', email: 'ana.souza@example.com' }),
    ]);
  });

  it.each([null, '{', JSON.stringify({ schemaVersion: 999 })])(
    'substitui payload ausente, corrompido ou incompatível por baseline (%s)',
    (raw) => expect(parseClienteSnapshot(raw)).toEqual(createClienteBaseline()),
  );

  it('migra V1 para V7 preservando dados e normalizando simulações', () => {
    const current = createClienteBaseline();
    const legacy: Record<string, unknown> = {
      ...current,
      schemaVersion: 1,
      sessionClienteId: 'cliente-ana',
      favoriteHubIds: [],
      favoriteStoreIds: [],
      accountDeletion: null,
      qa: { clockOffsetMs: 3_600_000, autoProgressOrders: false },
    };
    delete legacy.favoriteHubIdsByClienteId;
    delete legacy.favoriteStoreIdsByClienteId;
    delete legacy.passwordRecovery;

    expect(parseClienteSnapshot(JSON.stringify(legacy))).toMatchObject({
      schemaVersion: 7,
      sessionClienteId: 'cliente-ana',
      orderAutomation: {},
      qa: {
        clockOffsetMs: 3_600_000,
        autoProgressOrders: false,
        orderProgressionDelaysMs: null,
        simulations: {
          orders: 'normal',
          stores: 'normal',
          hubs: 'normal',
          favorites: 'normal',
          profile: 'normal',
          search: 'normal',
        },
      },
    });
  });

  it('migra V2 sem inventar agenda nem duração', () => {
    const current = createClienteBaseline();
    const pedido = structuredClone(
      createMockDb().pedidos.find((item) => item.cliente_id === 'cliente-ana')!,
    );
    current.accounts[0]!.profile.nome = 'Ana V2';
    current.orders = [pedido];
    current.qa.clockOffsetMs = 3_600_000;
    current.qa.simulations.orders = 'error';
    const { orderAutomation: _automation, ...withoutAutomation } = current;
    const legacy: Record<string, unknown> = {
      ...withoutAutomation,
      schemaVersion: 2,
      favoriteHubIds: [],
      favoriteStoreIds: [],
      accountDeletion: null,
      qa: { ...current.qa, autoProgressOrders: true, orderProgressionDelaysMs: undefined },
    };
    delete legacy.favoriteHubIdsByClienteId;
    delete legacy.favoriteStoreIdsByClienteId;
    delete legacy.passwordRecovery;

    expect(decodeClienteSnapshot(JSON.stringify(legacy))).toMatchObject({
      status: 'migrated',
      snapshot: {
        schemaVersion: 7,
        orderAutomation: {},
        accounts: [{ profile: { nome: 'Ana V2' } }],
        orders: [{ id: pedido.id }],
        qa: {
          autoProgressOrders: false,
          clockOffsetMs: 3_600_000,
          orderProgressionDelaysMs: null,
          simulations: { orders: 'error' },
        },
      },
    });
  });

  it('migra favoritos globais V3 para a conta demo sem perder dados', () => {
    const legacy: Record<string, unknown> = {
      ...createClienteBaseline(),
      schemaVersion: 3,
      favoriteHubIds: ['hub-legado'],
      favoriteStoreIds: ['store-legada'],
      accountDeletion: null,
    };
    delete legacy.favoriteHubIdsByClienteId;
    delete legacy.favoriteStoreIdsByClienteId;
    delete legacy.passwordRecovery;

    expect(decodeClienteSnapshot(JSON.stringify(legacy))).toMatchObject({
      status: 'migrated',
      snapshot: {
        schemaVersion: 7,
        favoriteHubIdsByClienteId: { 'cliente-ana': ['hub-legado'] },
        favoriteStoreIdsByClienteId: { 'cliente-ana': ['store-legada'] },
        passwordRecovery: null,
      },
    });
  });

  it('migra V4 para V7 sem perder favoritos isolados por conta', () => {
    const current = createClienteBaseline();
    current.favoriteHubIdsByClienteId = { 'cliente-ana': ['hub-v4'] };
    current.favoriteStoreIdsByClienteId = { 'cliente-ana': ['store-v4'] };
    const legacy: Record<string, unknown> = { ...current, schemaVersion: 4, accountDeletion: null };
    delete legacy.passwordRecovery;

    expect(decodeClienteSnapshot(JSON.stringify(legacy))).toMatchObject({
      status: 'migrated',
      snapshot: {
        schemaVersion: 7,
        favoriteHubIdsByClienteId: { 'cliente-ana': ['hub-v4'] },
        favoriteStoreIdsByClienteId: { 'cliente-ana': ['store-v4'] },
        passwordRecovery: null,
      },
    });
  });

  it('migra V5 convertendo o agendamento legado para sete dias exatos', () => {
    const legacy = {
      ...createClienteBaseline(),
      schemaVersion: 5,
      accountDeletion: { requestedAt: '2026-09-05T12:00:00.000Z' },
    };

    expect(decodeClienteSnapshot(JSON.stringify(legacy))).toMatchObject({
      status: 'migrated',
      snapshot: {
        schemaVersion: 7,
        accountDeletionsByClienteId: {
          'cliente-ana': {
            status: 'scheduled',
            requestedAt: '2026-09-05T12:00:00.000Z',
            deleteAt: '2026-09-12T12:00:00.000Z',
          },
        },
      },
    });
  });

  it('migra V6 isolando o agendamento legado no mapa da própria conta', () => {
    const current = createClienteBaseline();
    const legacy: Record<string, unknown> = {
      ...current,
      schemaVersion: 6,
      accountDeletion: {
        clienteId: 'cliente-ana',
        status: 'scheduled',
        requestedAt: '2026-09-05T12:00:00.000Z',
        deleteAt: '2026-09-12T12:00:00.000Z',
      },
    };
    delete legacy.accountDeletionsByClienteId;

    expect(decodeClienteSnapshot(JSON.stringify(legacy))).toMatchObject({
      status: 'migrated',
      snapshot: {
        schemaVersion: 7,
        accountDeletionsByClienteId: {
          'cliente-ana': {
            status: 'scheduled',
            requestedAt: '2026-09-05T12:00:00.000Z',
            deleteAt: '2026-09-12T12:00:00.000Z',
          },
        },
      },
    });
  });

  it.each(['requested', 'ready', 'expired', 'consumed'] as const)(
    'aceita o estado persistido de recuperação %s',
    (state) => {
      const snapshot = createClienteBaseline();
      Object.assign(snapshot, {
        passwordRecovery: { requestId: 'recovery-opaque123', clienteId: 'cliente-ana', state },
      });

      expect(decodeClienteSnapshot(JSON.stringify(snapshot))).toMatchObject({
        status: 'valid',
        snapshot: { passwordRecovery: { requestId: 'recovery-opaque123', clienteId: 'cliente-ana', state } },
      });
    },
  );

  it.each([
    ['conta inexistente', { requestId: 'recovery-opaque123', clienteId: 'cliente-inexistente', state: 'requested' }],
    ['estado desconhecido', { requestId: 'recovery-opaque123', clienteId: 'cliente-ana', state: 'unknown' }],
    ['ID não opaco', { requestId: 'ana.souza@example.com', clienteId: 'cliente-ana', state: 'requested' }],
    [
      'segredo extra',
      { requestId: 'recovery-opaque123', clienteId: 'cliente-ana', state: 'requested', password: 'segredo' },
    ],
  ])('rejeita recuperação persistida com %s', (_case, passwordRecovery) => {
    const snapshot = createClienteBaseline();
    Object.assign(snapshot, { passwordRecovery });

    expect(parseClienteSnapshot(JSON.stringify(snapshot))).toEqual(createClienteBaseline());
  });

  it.each(invalidCurrentCases)('rejeita snapshot atual com %s', (_case, corruption) => {
    const snapshot = createClienteBaseline();
    const pedido = structuredClone(
      createMockDb().pedidos.find((item) => item.cliente_id === 'cliente-ana')!,
    );
    snapshot.orders = [pedido];
    snapshot.qa = {
      ...snapshot.qa,
      orderProgressionDelaysMs: corruption.delays ?? {
        aceito: 1,
        em_preparo: 1,
        saindo_hub: 1,
        no_hub: 1,
      },
    };
    snapshot.orderAutomation = {
      [corruption.orderId ?? pedido.id]: { enteredStatusAt: corruption.anchor ?? pedido.criado_em },
    };

    expect(parseClienteSnapshot(JSON.stringify(snapshot))).toEqual(createClienteBaseline());
  });

  it('substitui snapshot com status de pedido inválido integralmente pelo baseline', () => {
    const db = createMockDb();
    const snapshot = createClienteBaseline();
    const pedido = structuredClone(db.pedidos.find((item) => item.cliente_id === 'cliente-ana')!);
    pedido.status = 'inexistente' as typeof pedido.status;
    snapshot.orders = [pedido];

    expect(parseClienteSnapshot(JSON.stringify(snapshot))).toEqual(createClienteBaseline());
  });

  it('rejeita snapshot V4 com domínio de simulação extra', () => {
    const snapshot = createClienteBaseline();
    (snapshot.qa.simulations as Record<string, string>).checkout = 'error';

    expect(parseClienteSnapshot(JSON.stringify(snapshot))).toEqual(createClienteBaseline());
  });

  it.each(['cliente-bruno', 'cliente-carla', 'cliente-diego'])(
    'rejeita o ID auxiliar real %s no snapshot Cliente',
    (reservedId) => {
      const snapshot = createClienteBaseline();
      snapshot.accounts[0]!.id = reservedId;
      snapshot.accounts[0]!.profile.id = reservedId;

      expect(parseClienteSnapshot(JSON.stringify(snapshot))).toEqual(createClienteBaseline());
    },
  );

  it('rejeita snapshot sem a conta demo cliente-ana', () => {
    const snapshot = createClienteBaseline();
    snapshot.accounts = [];

    expect(parseClienteSnapshot(JSON.stringify(snapshot))).toEqual(createClienteBaseline());
  });

  it.each([
    {
      invariant: 'sessão pertence a uma conta',
      corrupt(snapshot: ReturnType<typeof createClienteBaseline>) {
        snapshot.sessionClienteId = 'cliente-inexistente';
      },
    },
    {
      invariant: 'IDs de conta são únicos',
      corrupt(snapshot: ReturnType<typeof createClienteBaseline>) {
        snapshot.accounts.push(structuredClone(snapshot.accounts[0]!));
      },
    },
    {
      invariant: 'e-mails de conta normalizados são únicos',
      corrupt(snapshot: ReturnType<typeof createClienteBaseline>) {
        const duplicate = structuredClone(snapshot.accounts[0]!);
        duplicate.id = 'cliente-nova';
        duplicate.profile.id = duplicate.id;
        duplicate.email = ` ${duplicate.email.toUpperCase()} `;
        snapshot.accounts.push(duplicate);
      },
    },
    {
      invariant: 'IDs de pedido são únicos',
      corrupt(snapshot: ReturnType<typeof createClienteBaseline>) {
        const db = createMockDb();
        const orders = structuredClone(db.pedidos.filter((item) => item.cliente_id === 'cliente-ana').slice(0, 2));
        orders[1]!.id = orders[0]!.id;
        orders[1]!.itens.forEach((item) => {
          item.pedido_id = orders[0]!.id;
        });
        snapshot.orders = orders;
      },
    },
    {
      invariant: 'IDs de item são únicos globalmente',
      corrupt(snapshot: ReturnType<typeof createClienteBaseline>) {
        const db = createMockDb();
        const first = structuredClone(db.pedidos.find((item) => item.cliente_id === 'cliente-ana')!);
        const second = structuredClone(first);
        second.id = `${first.id}-outro`;
        second.itens.forEach((item) => {
          item.pedido_id = second.id;
        });
        snapshot.orders = [first, second];
      },
    },
    {
      invariant: 'IDs reservados ao domínio Lojista não são aceitos',
      corrupt(snapshot: ReturnType<typeof createClienteBaseline>) {
        snapshot.accounts[0]!.id = 'lj-cliente-thiago';
        snapshot.accounts[0]!.profile.id = 'lj-cliente-thiago';
      },
    },
    {
      invariant: 'pedidos pertencem a uma conta do snapshot',
      corrupt(snapshot: ReturnType<typeof createClienteBaseline>) {
        const db = createMockDb();
        const pedido = structuredClone(db.pedidos.find((item) => item.cliente_id === 'cliente-ana')!);
        pedido.cliente_id = 'cliente-inexistente';
        snapshot.orders = [pedido];
      },
    },
    {
      invariant: 'itens apontam para o próprio pedido',
      corrupt(snapshot: ReturnType<typeof createClienteBaseline>) {
        const db = createMockDb();
        const pedido = structuredClone(db.pedidos.find((item) => item.cliente_id === 'cliente-ana')!);
        pedido.itens[0]!.pedido_id = 'pedido-inexistente';
        snapshot.orders = [pedido];
      },
    },
  ])('rejeita snapshot quando $invariant', ({ corrupt }) => {
    const snapshot = createClienteBaseline();
    corrupt(snapshot);

    expect(parseClienteSnapshot(JSON.stringify(snapshot))).toEqual(createClienteBaseline());
  });

  it('aplica somente o domínio Cliente e preserva dados do Lojista', () => {
    const db = createMockDb();
    const lojistaContas = structuredClone(db.lojistaContas);
    const estabelecimentosCadastrados = structuredClone(db.estabelecimentosCadastrados);
    applyClienteSnapshot(db, createClienteBaseline());
    expect(db.lojistaContas).toEqual(lojistaContas);
    expect(db.estabelecimentosCadastrados).toEqual(estabelecimentosCadastrados);
    expect(db.pedidos.filter((pedido) => pedido.cliente_id === 'cliente-ana')).toEqual([]);
  });

  it('restaura perfil, credenciais, sessão e pedido do Cliente sem tocar dados auxiliares ou do Lojista', () => {
    const db = createMockDb();
    const clienteAuxiliar = structuredClone(db.clientes.find((cliente) => cliente.id === 'lj-cliente-thiago')!);
    const pedidosAuxiliares = structuredClone(db.pedidos.filter((pedido) => pedido.cliente_id !== 'cliente-ana'));
    const lojistaContas = structuredClone(db.lojistaContas);
    const estabelecimentosCadastrados = structuredClone(db.estabelecimentosCadastrados);
    const pedido = structuredClone(db.pedidos.find((item) => item.cliente_id === 'cliente-ana')!);
    pedido.id = 'pedido-cliente-restaurado';

    const snapshot = createClienteBaseline();
    snapshot.accounts[0]!.profile.nome = 'Ana Restaurada';
    snapshot.accounts[0]!.email = 'ana.restaurada@example.com';
    snapshot.accounts[0]!.password = 'senha-restaurada';
    snapshot.sessionClienteId = 'cliente-ana';
    snapshot.orders = [pedido];

    applyClienteSnapshot(db, snapshot);

    expect(db.clientes.find((cliente) => cliente.id === 'cliente-ana')).toEqual(snapshot.accounts[0]!.profile);
    expect(db.clienteCredenciais.find((credential) => credential.clienteId === 'cliente-ana')).toEqual({
      clienteId: 'cliente-ana',
      email: 'ana.restaurada@example.com',
      password: 'senha-restaurada',
    });
    expect(db.sessionClienteId).toBe('cliente-ana');
    expect(db.clienteQaState).toEqual(snapshot.qa);
    expect(db.clienteOrderAutomation).toEqual(snapshot.orderAutomation);
    expect(db.pedidos.filter((item) => item.cliente_id === 'cliente-ana')).toEqual([pedido]);
    expect(db.clientes.find((cliente) => cliente.id === 'lj-cliente-thiago')).toEqual(clienteAuxiliar);
    expect(db.pedidos.filter((item) => item.cliente_id !== 'cliente-ana')).toEqual(pedidosAuxiliares);
    expect(db.lojistaContas).toEqual(lojistaContas);
    expect(db.estabelecimentosCadastrados).toEqual(estabelecimentosCadastrados);
  });
});
