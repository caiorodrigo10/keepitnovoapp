import type { DemoScenarioStatus } from '../ports/demo-scenario.port';
import {
  CLIENTE_MOCK_STATE_KEY,
  applyClienteSnapshot,
  createClienteBaseline,
  decodeClienteSnapshot,
  type ClienteMockSnapshotV1,
  type ClienteMockStorage,
} from './cliente-state';
import type { MockDb } from './db';

type PersistenceError = Exclude<DemoScenarioStatus['lastError'], 'read' | null>;

export class ClienteMockStateStore {
  private hydrated = false;
  private lastSnapshot = createClienteBaseline();
  private readonly managedClienteIds = new Set<string>();
  private status: DemoScenarioStatus = {
    hydrated: false,
    persistence: 'ready',
    lastError: null,
  };
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: MockDb,
    private readonly storage: ClienteMockStorage,
  ) {
    this.rememberCurrentClienteIds();
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;

    try {
      const raw = await this.storage.getItem(CLIENTE_MOCK_STATE_KEY);
      const decoded = decodeClienteSnapshot(raw);
      const snapshot = decoded.snapshot;
      this.rememberSnapshotClienteIds(snapshot);
      this.removeManagedClienteDomain();
      this.lastSnapshot = structuredClone(snapshot);
      applyClienteSnapshot(this.db, snapshot);
      this.hydrated = true;
      this.status = { hydrated: true, persistence: 'ready', lastError: null };

      if (decoded.status === 'recovered') {
        await this.enqueueSnapshot(snapshot, 'write');
      }
    } catch {
      const baseline = createClienteBaseline();
      this.rememberSnapshotClienteIds(baseline);
      this.removeManagedClienteDomain();
      this.lastSnapshot = structuredClone(baseline);
      applyClienteSnapshot(this.db, baseline);
      this.hydrated = true;
      this.status = { hydrated: true, persistence: 'degraded', lastError: 'read' };
    }
  }

  persist(): Promise<void> {
    const snapshot = this.captureSnapshot();
    this.lastSnapshot = structuredClone(snapshot);
    return this.enqueueSnapshot(snapshot, 'write');
  }

  async reset(): Promise<void> {
    const baseline = createClienteBaseline();
    this.rememberCurrentClienteIds();
    this.removeManagedClienteDomain();
    this.lastSnapshot = structuredClone(baseline);
    applyClienteSnapshot(this.db, baseline);
    this.managedClienteIds.clear();
    this.rememberSnapshotClienteIds(baseline);
    await this.enqueueSnapshot(baseline, 'reset');
  }

  getStatus(): DemoScenarioStatus {
    return { ...this.status };
  }

  private captureSnapshot(): ClienteMockSnapshotV1 {
    this.rememberCurrentClienteIds();
    const accounts = this.db.clienteCredenciais.flatMap((credential) => {
      const profile = this.db.clientes.find((cliente) => cliente.id === credential.clienteId);
      if (!profile || credential.password === undefined) return [];
      return [{ id: profile.id, email: credential.email, password: credential.password, profile }];
    });
    const clienteIds = new Set(accounts.map((account) => account.id));

    return structuredClone({
      ...this.lastSnapshot,
      accounts,
      sessionClienteId: this.db.sessionClienteId,
      orders: this.db.pedidos.filter((pedido) => clienteIds.has(pedido.cliente_id)),
    });
  }

  private enqueueSnapshot(snapshot: ClienteMockSnapshotV1, error: PersistenceError): Promise<void> {
    const payload = JSON.stringify(structuredClone(snapshot));
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await this.storage.setItem(CLIENTE_MOCK_STATE_KEY, payload);
        this.status = { hydrated: this.hydrated, persistence: 'ready', lastError: null };
      } catch {
        this.status = { hydrated: this.hydrated, persistence: 'degraded', lastError: error };
      }
    });
    return this.writeQueue;
  }

  private rememberCurrentClienteIds(): void {
    this.db.clienteCredenciais.forEach((credential) => this.managedClienteIds.add(credential.clienteId));
  }

  private rememberSnapshotClienteIds(snapshot: ClienteMockSnapshotV1): void {
    snapshot.accounts.forEach((account) => this.managedClienteIds.add(account.id));
  }

  private removeManagedClienteDomain(): void {
    this.db.clientes = this.db.clientes.filter((cliente) => !this.managedClienteIds.has(cliente.id));
    this.db.clienteCredenciais = this.db.clienteCredenciais.filter(
      (credential) => !this.managedClienteIds.has(credential.clienteId),
    );
    this.db.pedidos = this.db.pedidos.filter((pedido) => !this.managedClienteIds.has(pedido.cliente_id));
  }
}
