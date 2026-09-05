import type { Cliente } from '../ports/auth.port';
import {
  QA_SIMULATION_DOMAINS,
  type QaScenarioState,
  type QaSimulationState,
} from '../ports/demo-scenario.port';
import type { Pedido, PedidoItem, PedidoStatus } from '../ports/order.port';
import { clientesCredenciaisFixture, clientesFixture } from './fixtures';
import type { MockDb } from './db';
import type { OrderAutomationRuntime } from './order-auto-progress';

export const CLIENTE_MOCK_SCHEMA_VERSION = 3 as const;
export const CLIENTE_MOCK_STATE_KEY = '@keepit/cliente:mock-state';
export const CLIENTE_DEMO_INITIAL_PASSWORD = 'keepit123';

const RESERVED_AUXILIARY_CLIENTE_IDS = new Set(['cliente-bruno', 'cliente-carla', 'cliente-diego']);

export interface ClienteMockStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ClienteMockAccount {
  id: string;
  email: string;
  password: string;
  profile: Cliente;
}

interface ClienteMockSnapshotV1 {
  schemaVersion: 1;
  accounts: ClienteMockAccount[];
  sessionClienteId: string | null;
  orders: Pedido[];
  favoriteHubIds: string[];
  favoriteStoreIds: string[];
  selectedHubId: string | null;
  accountDeletion: { requestedAt: string } | null;
  qa: { clockOffsetMs: number; autoProgressOrders: boolean };
}

export interface ClienteMockSnapshotV2 {
  schemaVersion: 2;
  accounts: ClienteMockAccount[];
  sessionClienteId: string | null;
  orders: Pedido[];
  favoriteHubIds: string[];
  favoriteStoreIds: string[];
  selectedHubId: string | null;
  accountDeletion: { requestedAt: string } | null;
  qa: Omit<QaScenarioState, 'orderProgressionDelaysMs'>;
}

export interface ClienteMockSnapshotV3 {
  schemaVersion: 3;
  accounts: ClienteMockAccount[];
  sessionClienteId: string | null;
  orders: Pedido[];
  orderAutomation: Record<string, OrderAutomationRuntime>;
  favoriteHubIds: string[];
  favoriteStoreIds: string[];
  selectedHubId: string | null;
  accountDeletion: { requestedAt: string } | null;
  qa: QaScenarioState;
}

export type ClienteMockSnapshotDecodeResult =
  | { status: 'valid'; snapshot: ClienteMockSnapshotV3 }
  | { status: 'migrated'; snapshot: ClienteMockSnapshotV3 }
  | { status: 'recovered'; reason: 'missing' | 'invalid'; snapshot: ClienteMockSnapshotV3 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const qaSimulationStates = new Set<QaSimulationState>(['normal', 'loading', 'empty', 'error']);
const orderProgressionStatuses = ['aceito', 'em_preparo', 'saindo_hub', 'no_hub'] as const;

function hasValidSimulations(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    Object.keys(value).length === QA_SIMULATION_DOMAINS.length &&
    QA_SIMULATION_DOMAINS.every((domain) => qaSimulationStates.has(value[domain] as QaSimulationState))
  );
}

function hasValidOrderProgressionDelays(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).length !== orderProgressionStatuses.length) return false;

  return orderProgressionStatuses.every(
    (status) => typeof value[status] === 'number' && Number.isFinite(value[status]) && value[status] >= 0,
  );
}

function isQaScenarioState(value: unknown): value is QaScenarioState {
  if (
    !isRecord(value) ||
    typeof value.clockOffsetMs !== 'number' ||
    typeof value.autoProgressOrders !== 'boolean' ||
    !(value.orderProgressionDelaysMs === null || hasValidOrderProgressionDelays(value.orderProgressionDelaysMs))
  ) {
    return false;
  }

  return hasValidSimulations(value.simulations);
}

function isLegacyQaScenarioState(value: unknown): value is ClienteMockSnapshotV2['qa'] {
  return (
    isRecord(value) &&
    typeof value.clockOffsetMs === 'number' &&
    typeof value.autoProgressOrders === 'boolean' &&
    value.orderProgressionDelaysMs === undefined &&
    hasValidSimulations(value.simulations)
  );
}

const pedidoStatuses = new Set<PedidoStatus>([
  'aguardando_pagamento',
  'aguardando_aceite',
  'aceito',
  'em_preparo',
  'saindo_hub',
  'no_hub',
  'entregue',
  'cancelado',
  'cancelado_timeout',
  'cancelado_atraso',
  'cancelado_admin',
  'recusado',
  'nao_retirado',
  'nao_entregue_lojista',
  'estornado_chargeback',
]);

function isPedidoStatus(value: unknown): value is PedidoStatus {
  return typeof value === 'string' && pedidoStatuses.has(value as PedidoStatus);
}

function isCliente(value: unknown): value is Cliente {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.nome === 'string' &&
    isNullableString(value.telefone) &&
    isNullableString(value.cpf) &&
    typeof value.criado_em === 'string' &&
    (value.bloqueado === undefined || typeof value.bloqueado === 'boolean') &&
    (value.motivo_bloqueio === undefined || isNullableString(value.motivo_bloqueio))
  );
}

function isPedidoItem(value: unknown): value is PedidoItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.pedido_id === 'string' &&
    isNullableString(value.produto_id) &&
    typeof value.nome_snapshot === 'string' &&
    typeof value.preco_unitario_reais === 'number' &&
    typeof value.quantidade === 'number' &&
    typeof value.subtotal_reais === 'number'
  );
}

function isPedido(value: unknown): value is Pedido {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.numero === 'number' &&
    typeof value.cliente_id === 'string' &&
    typeof value.estabelecimento_id === 'string' &&
    typeof value.hub_id === 'string' &&
    isPedidoStatus(value.status) &&
    typeof value.pin_texto === 'string' &&
    typeof value.tentativas_pin === 'number' &&
    isNullableString(value.pin_bloqueado_ate) &&
    (value.tempo_estimado_min === null || typeof value.tempo_estimado_min === 'number') &&
    typeof value.criado_em === 'string' &&
    isNullableString(value.aceito_em) &&
    isNullableString(value.saiu_hub_em) &&
    isNullableString(value.cliente_chegou_em) &&
    isNullableString(value.lojista_chegou_em) &&
    isNullableString(value.entregue_em) &&
    isNullableString(value.cancelado_em) &&
    typeof value.subtotal_produtos_reais === 'number' &&
    typeof value.taxa_deslocamento_reais === 'number' &&
    typeof value.taxa_keepit_reais === 'number' &&
    typeof value.taxa_servico_comprador_reais === 'number' &&
    typeof value.total_pago_reais === 'number' &&
    isNullableString(value.motivo_recusa) &&
    isNullableString(value.motivo_cancelamento) &&
    isNullableString(value.motivo_nao_retirado) &&
    (value.forma_pagamento === 'pix' || value.forma_pagamento === 'cartao') &&
    Array.isArray(value.itens) &&
    value.itens.every(isPedidoItem)
  );
}

function hasValidSnapshotShape(value: unknown): value is Omit<ClienteMockSnapshotV1, 'schemaVersion' | 'qa'> & {
  schemaVersion: number;
  qa: Record<string, unknown>;
} {
  return (
    isRecord(value) &&
    Array.isArray(value.accounts) &&
    value.accounts.every(
      (account) =>
        isRecord(account) &&
        typeof account.id === 'string' &&
        typeof account.email === 'string' &&
        typeof account.password === 'string' &&
        isCliente(account.profile) &&
        account.profile.id === account.id,
    ) &&
    isNullableString(value.sessionClienteId) &&
    Array.isArray(value.orders) &&
    value.orders.every(isPedido) &&
    isStringArray(value.favoriteHubIds) &&
    isStringArray(value.favoriteStoreIds) &&
    isNullableString(value.selectedHubId) &&
    (value.accountDeletion === null ||
      (isRecord(value.accountDeletion) && typeof value.accountDeletion.requestedAt === 'string')) &&
    isRecord(value.qa)
  );
}

function hasValidClienteIdentity(
  snapshot: ClienteMockSnapshotV1 | ClienteMockSnapshotV2 | ClienteMockSnapshotV3,
): boolean {
  const accountIds = snapshot.accounts.map((account) => account.id);
  const accountEmails = snapshot.accounts.map((account) => account.email.trim().toLowerCase());
  const orderIds = snapshot.orders.map((order) => order.id);
  const itemIds = snapshot.orders.flatMap((order) => order.itens.map((item) => item.id));
  const accountIdSet = new Set(accountIds);

  return (
    accountIds.includes('cliente-ana') &&
    accountIds.every((id) => !id.startsWith('lj-cliente-') && !RESERVED_AUXILIARY_CLIENTE_IDS.has(id)) &&
    hasUniqueValues(accountIds) &&
    hasUniqueValues(accountEmails) &&
    hasUniqueValues(orderIds) &&
    hasUniqueValues(itemIds) &&
    (snapshot.sessionClienteId === null || accountIdSet.has(snapshot.sessionClienteId)) &&
    snapshot.orders.every(
      (order) =>
        accountIdSet.has(order.cliente_id) && order.itens.every((item) => item.pedido_id === order.id),
    )
  );
}

function isClienteMockSnapshotV1(value: unknown): value is ClienteMockSnapshotV1 {
  const hasValidShape =
    hasValidSnapshotShape(value) &&
    value.schemaVersion === 1 &&
    typeof value.qa.clockOffsetMs === 'number' &&
    typeof value.qa.autoProgressOrders === 'boolean';

  return hasValidShape && hasValidClienteIdentity(value as ClienteMockSnapshotV1);
}

function isClienteMockSnapshotV2(value: unknown): value is ClienteMockSnapshotV2 {
  const hasValidShape =
    hasValidSnapshotShape(value) &&
    value.schemaVersion === 2 &&
    isLegacyQaScenarioState(value.qa);

  return hasValidShape && hasValidClienteIdentity(value as unknown as ClienteMockSnapshotV2);
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function hasValidOrderAutomation(value: unknown, orderIds: ReadonlySet<string>): boolean {
  if (!isRecord(value)) return false;

  return Object.entries(value).every(
    ([orderId, runtime]) =>
      orderIds.has(orderId) &&
      isRecord(runtime) &&
      Object.keys(runtime).length === 1 &&
      isIsoInstant(runtime.enteredStatusAt),
  );
}

function isClienteMockSnapshotV3(value: unknown): value is ClienteMockSnapshotV3 {
  const hasValidShape =
    hasValidSnapshotShape(value) &&
    value.schemaVersion === CLIENTE_MOCK_SCHEMA_VERSION &&
    isQaScenarioState(value.qa) &&
    hasValidOrderAutomation(
      (value as Record<string, unknown>).orderAutomation,
      new Set(value.orders.map((order) => order.id)),
    );

  return hasValidShape && hasValidClienteIdentity(value as unknown as ClienteMockSnapshotV3);
}

export function createDefaultQaScenarioState(): QaScenarioState {
  return {
    clockOffsetMs: 0,
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
  };
}

function migrateLegacyClienteSnapshot(
  snapshot: ClienteMockSnapshotV1 | ClienteMockSnapshotV2,
): ClienteMockSnapshotV3 {
  return {
    ...structuredClone(snapshot),
    schemaVersion: CLIENTE_MOCK_SCHEMA_VERSION,
    orderAutomation: {},
    qa: {
      clockOffsetMs: snapshot.qa.clockOffsetMs,
      autoProgressOrders: false,
      orderProgressionDelaysMs: null,
      simulations:
        'simulations' in snapshot.qa
          ? structuredClone(snapshot.qa.simulations)
          : createDefaultQaScenarioState().simulations,
    },
  };
}

export function createClienteBaseline(): ClienteMockSnapshotV3 {
  const profile = clientesFixture.find((cliente) => cliente.id === 'cliente-ana');
  const credential = clientesCredenciaisFixture.find((item) => item.clienteId === 'cliente-ana');

  if (!profile || !credential) {
    throw new Error('Fixture demo do Cliente não encontrada.');
  }

  return {
    schemaVersion: CLIENTE_MOCK_SCHEMA_VERSION,
    accounts: [
      {
        id: profile.id,
        email: credential.email,
        password: CLIENTE_DEMO_INITIAL_PASSWORD,
        profile: structuredClone(profile),
      },
    ],
    sessionClienteId: null,
    orders: [],
    orderAutomation: {},
    favoriteHubIds: [],
    favoriteStoreIds: [],
    selectedHubId: null,
    accountDeletion: null,
    qa: createDefaultQaScenarioState(),
  };
}

export function decodeClienteSnapshot(raw: string | null): ClienteMockSnapshotDecodeResult {
  if (raw === null) {
    return { status: 'recovered', reason: 'missing', snapshot: createClienteBaseline() };
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (isClienteMockSnapshotV3(value)) {
      return { status: 'valid', snapshot: structuredClone(value) };
    }
    if (isClienteMockSnapshotV2(value)) {
      return { status: 'migrated', snapshot: migrateLegacyClienteSnapshot(value) };
    }
    if (isClienteMockSnapshotV1(value)) {
      return { status: 'migrated', snapshot: migrateLegacyClienteSnapshot(value) };
    }
    return { status: 'recovered', reason: 'invalid', snapshot: createClienteBaseline() };
  } catch {
    return { status: 'recovered', reason: 'invalid', snapshot: createClienteBaseline() };
  }
}

export function parseClienteSnapshot(raw: string | null): ClienteMockSnapshotV3 {
  return decodeClienteSnapshot(raw).snapshot;
}

export function applyClienteSnapshot(db: MockDb, snapshot: ClienteMockSnapshotV3): void {
  const clienteIds = new Set(snapshot.accounts.map((account) => account.id));
  db.clientes = db.clientes.filter((cliente) => !clienteIds.has(cliente.id));
  db.clienteCredenciais = db.clienteCredenciais.filter((credential) => !clienteIds.has(credential.clienteId));
  db.pedidos = db.pedidos.filter((pedido) => !clienteIds.has(pedido.cliente_id));

  db.clientes.push(...structuredClone(snapshot.accounts.map((account) => account.profile)));
  db.clienteCredenciais.push(
    ...structuredClone(
      snapshot.accounts.map((account) => ({
        clienteId: account.id,
        email: account.email,
        password: account.password,
      })),
    ),
  );
  db.pedidos.push(...structuredClone(snapshot.orders.filter((pedido) => clienteIds.has(pedido.cliente_id))));
  db.sessionClienteId = snapshot.sessionClienteId;
  db.favoriteHubIds = structuredClone(snapshot.favoriteHubIds);
  db.favoriteStoreIds = structuredClone(snapshot.favoriteStoreIds);
  db.clienteQaState = structuredClone(snapshot.qa);
  db.clienteOrderAutomation = structuredClone(snapshot.orderAutomation);
}
