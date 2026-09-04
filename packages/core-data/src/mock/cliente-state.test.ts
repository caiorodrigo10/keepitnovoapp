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

  it('aplica somente o domínio Cliente e preserva dados do Lojista', () => {
    const db = createMockDb();
    const lojistaContas = structuredClone(db.lojistaContas);
    const estabelecimentosCadastrados = structuredClone(db.estabelecimentosCadastrados);
    applyClienteSnapshot(db, createClienteBaseline());
    expect(db.lojistaContas).toEqual(lojistaContas);
    expect(db.estabelecimentosCadastrados).toEqual(estabelecimentosCadastrados);
    expect(db.pedidos.filter((pedido) => pedido.cliente_id === 'cliente-ana')).toEqual([]);
  });
});
