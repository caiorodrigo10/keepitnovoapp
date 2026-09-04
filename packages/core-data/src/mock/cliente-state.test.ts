import { describe, expect, it } from 'vitest';
import { createMockDb } from './db';
import {
  CLIENTE_MOCK_SCHEMA_VERSION,
  applyClienteSnapshot,
  createClienteBaseline,
  parseClienteSnapshot,
} from './cliente-state';

describe('cliente-state', () => {
  it('cria baseline com conta demo, mas sem dados de uso do Cliente', () => {
    const state = createClienteBaseline();
    expect(state).toMatchObject({
      schemaVersion: CLIENTE_MOCK_SCHEMA_VERSION,
      sessionClienteId: null,
      selectedHubId: null,
      favoriteHubIds: [],
      favoriteStoreIds: [],
      orders: [],
      accountDeletion: null,
      qa: { clockOffsetMs: 0, autoProgressOrders: true },
    });
    expect(state.accounts).toEqual([
      expect.objectContaining({ id: 'cliente-ana', email: 'ana.souza@example.com' }),
    ]);
  });

  it.each([null, '{', JSON.stringify({ schemaVersion: 999 })])(
    'substitui payload ausente, corrompido ou incompatível por baseline (%s)',
    (raw) => expect(parseClienteSnapshot(raw)).toEqual(createClienteBaseline()),
  );

  it('substitui snapshot com status de pedido inválido integralmente pelo baseline', () => {
    const db = createMockDb();
    const snapshot = createClienteBaseline();
    const pedido = structuredClone(db.pedidos.find((item) => item.cliente_id === 'cliente-ana')!);
    pedido.status = 'inexistente' as typeof pedido.status;
    snapshot.orders = [pedido];

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
    expect(db.pedidos.filter((item) => item.cliente_id === 'cliente-ana')).toEqual([pedido]);
    expect(db.clientes.find((cliente) => cliente.id === 'lj-cliente-thiago')).toEqual(clienteAuxiliar);
    expect(db.pedidos.filter((item) => item.cliente_id !== 'cliente-ana')).toEqual(pedidosAuxiliares);
    expect(db.lojistaContas).toEqual(lojistaContas);
    expect(db.estabelecimentosCadastrados).toEqual(estabelecimentosCadastrados);
  });
});
