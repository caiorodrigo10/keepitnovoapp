import type { MockDb } from './db';
import type { CardRegistration, SavedCardSummary, SavedCardsPort } from '../ports/saved-cards.port';

type SavedCardState = {
  cardsByCliente: Map<string, SavedCardSummary[]>;
  registrations: Map<string, CardRegistration>;
  managementOperations: Map<string, { action: 'principal' | 'remover'; cartaoId: string }>;
  nextId: number;
};

const states = new WeakMap<MockDb, SavedCardState>();

function stateFor(db: MockDb): SavedCardState {
  let state = states.get(db);
  if (!state) {
    state = { cardsByCliente: new Map(), registrations: new Map(), managementOperations: new Map(), nextId: 1 };
    states.set(db, state);
  }
  return state;
}

function clienteId(db: MockDb): string {
  if (!db.sessionClienteId) throw new Error('ACESSO_NEGADO');
  return db.sessionClienteId;
}

function list(state: SavedCardState, cliente: string): SavedCardSummary[] {
  return structuredClone(state.cardsByCliente.get(cliente) ?? []).sort((left, right) => Number(right.principal) - Number(left.principal));
}

function save(state: SavedCardState, cliente: string, cards: SavedCardSummary[]): SavedCardSummary[] {
  state.cardsByCliente.set(cliente, structuredClone(cards).sort((left, right) => Number(right.principal) - Number(left.principal)));
  return list(state, cliente);
}

function operationKey(cliente: string, operacaoId: string): string {
  return `${cliente}:${operacaoId}`;
}

function replayed(state: SavedCardState, cliente: string, operacaoId: string, action: 'principal' | 'remover', cartaoId: string): boolean {
  const existing = state.managementOperations.get(operationKey(cliente, operacaoId));
  if (!existing) return false;
  if (existing.action !== action || existing.cartaoId !== cartaoId) throw new Error('OPERACAO_DIVERGENTE');
  return true;
}

/** Estado deliberadamente demonstrativo: somente IDs/metadados públicos, nunca token ou formulário. */
export function createSavedCardsMock(db: MockDb): SavedCardsPort {
  const state = stateFor(db);
  return {
    async listar() {
      return list(state, clienteId(db));
    },
    async definirPrincipal({ cartaoId, operacaoId }) {
      const cliente = clienteId(db);
      if (replayed(state, cliente, operacaoId, 'principal', cartaoId)) return list(state, cliente);
      const cards = list(state, cliente);
      if (!cards.some((card) => card.id === cartaoId)) throw new Error('CARTAO_INDISPONIVEL');
      state.managementOperations.set(operationKey(cliente, operacaoId), { action: 'principal', cartaoId });
      return save(state, cliente, cards.map((card) => ({ ...card, principal: card.id === cartaoId })));
    },
    async remover({ cartaoId, operacaoId }) {
      const cliente = clienteId(db);
      if (replayed(state, cliente, operacaoId, 'remover', cartaoId)) return list(state, cliente);
      const cards = list(state, cliente);
      const index = cards.findIndex((card) => card.id === cartaoId);
      if (index < 0) throw new Error('CARTAO_INDISPONIVEL');
      const removed = cards[index]!;
      const remaining = cards.filter((card) => card.id !== cartaoId);
      if (removed.principal && remaining.length > 0) remaining[0] = { ...remaining[0]!, principal: true };
      state.managementOperations.set(operationKey(cliente, operacaoId), { action: 'remover', cartaoId });
      return save(state, cliente, remaining);
    },
    async consultarConfiguracao() {
      return { disponivel: true, valorCentavos: 137 };
    },
    async cadastrar({ operacaoId, cartao }) {
      const cliente = clienteId(db);
      const registrationKey = `${cliente}:${operacaoId}`;
      const existing = state.registrations.get(registrationKey);
      if (existing) return structuredClone(existing);
      const current = list(state, cliente);
      const summary: SavedCardSummary = {
        id: `card_demo_${state.nextId++}`,
        bandeira: 'DEMO',
        ultimo4: cartao.number.slice(-4),
        principal: current.length === 0,
      };
      save(state, cliente, [...current, summary]);
      const registration: CardRegistration = { id: operacaoId, estado: 'concluida', valorCentavos: 137 };
      state.registrations.set(registrationKey, registration);
      return structuredClone(registration);
    },
    async consultarCadastro(operacaoId) {
      const registration = state.registrations.get(`${clienteId(db)}:${operacaoId}`);
      return registration ? structuredClone(registration) : null;
    },
  };
}

export function mockSavedCardExists(db: MockDb, cartaoId: string): boolean {
  const session = db.sessionClienteId;
  return !!session && (stateFor(db).cardsByCliente.get(session) ?? []).some((card) => card.id === cartaoId);
}
