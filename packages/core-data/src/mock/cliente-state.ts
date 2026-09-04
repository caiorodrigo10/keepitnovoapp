import type { Cliente } from '../ports/auth.port';
import type { Pedido, PedidoItem, PedidoStatus } from '../ports/order.port';
import { clientesCredenciaisFixture, clientesFixture } from './fixtures';
import type { MockDb } from './db';

export const CLIENTE_MOCK_SCHEMA_VERSION = 1 as const;
export const CLIENTE_MOCK_STATE_KEY = '@keepit/cliente:mock-state';
export const CLIENTE_DEMO_INITIAL_PASSWORD = 'keepit123';

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

export interface ClienteMockSnapshotV1 {
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

export type ClienteMockSnapshotDecodeResult =
  | { status: 'valid'; snapshot: ClienteMockSnapshotV1 }
  | { status: 'recovered'; reason: 'missing' | 'invalid'; snapshot: ClienteMockSnapshotV1 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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

function isClienteMockSnapshotV1(value: unknown): value is ClienteMockSnapshotV1 {
  return (
    isRecord(value) &&
    value.schemaVersion === CLIENTE_MOCK_SCHEMA_VERSION &&
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
    isRecord(value.qa) &&
    typeof value.qa.clockOffsetMs === 'number' &&
    typeof value.qa.autoProgressOrders === 'boolean'
  );
}

export function createClienteBaseline(): ClienteMockSnapshotV1 {
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
    favoriteHubIds: [],
    favoriteStoreIds: [],
    selectedHubId: null,
    accountDeletion: null,
    qa: { clockOffsetMs: 0, autoProgressOrders: true },
  };
}

export function decodeClienteSnapshot(raw: string | null): ClienteMockSnapshotDecodeResult {
  if (raw === null) {
    return { status: 'recovered', reason: 'missing', snapshot: createClienteBaseline() };
  }

  try {
    const value: unknown = JSON.parse(raw);
    return isClienteMockSnapshotV1(value)
      ? { status: 'valid', snapshot: structuredClone(value) }
      : { status: 'recovered', reason: 'invalid', snapshot: createClienteBaseline() };
  } catch {
    return { status: 'recovered', reason: 'invalid', snapshot: createClienteBaseline() };
  }
}

export function parseClienteSnapshot(raw: string | null): ClienteMockSnapshotV1 {
  return decodeClienteSnapshot(raw).snapshot;
}

export function applyClienteSnapshot(db: MockDb, snapshot: ClienteMockSnapshotV1): void {
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
}
