import type {
  DemoScenarioMutationResult,
  DemoScenarioResetResult,
  DemoScenarioStatus,
  QaScenarioState,
} from '../ports/demo-scenario.port';
import {
  CLIENTE_MOCK_STATE_KEY,
  applyClienteSnapshot,
  createClienteBaseline,
  decodeClienteSnapshot,
  type ClienteMockSnapshotV3,
  type ClienteMockStorage,
} from './cliente-state';
import type { MockDb } from './db';
import { reconcileAutomaticOrder } from './order-auto-progress';

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
      const caughtUp = this.reconcileHydratedOrders();
      if (caughtUp) {
        this.lastSnapshot = this.captureSnapshot();
      }
      this.hydrated = true;
      this.status = { hydrated: true, persistence: 'ready', lastError: null };

      if (decoded.status !== 'valid' || caughtUp) {
        await this.enqueueSnapshot(this.lastSnapshot, 'write');
      }
      this.connectMutationPersistence();
    } catch {
      const baseline = createClienteBaseline();
      this.rememberSnapshotClienteIds(baseline);
      this.removeManagedClienteDomain();
      this.lastSnapshot = structuredClone(baseline);
      applyClienteSnapshot(this.db, baseline);
      this.hydrated = true;
      this.status = { hydrated: true, persistence: 'degraded', lastError: 'read' };
      this.connectMutationPersistence();
    }
  }

  persist(): Promise<boolean> {
    const snapshot = this.captureSnapshot();
    this.lastSnapshot = structuredClone(snapshot);
    return this.enqueueSnapshot(snapshot, 'write');
  }

  flush(): Promise<void> {
    return this.writeQueue;
  }

  async reset(): Promise<DemoScenarioResetResult> {
    const baseline = createClienteBaseline();
    this.rememberCurrentClienteIds();
    const resetClienteIds = [...this.managedClienteIds];
    this.removeManagedClienteDomain();
    this.lastSnapshot = structuredClone(baseline);
    applyClienteSnapshot(this.db, baseline);
    this.managedClienteIds.clear();
    this.rememberSnapshotClienteIds(baseline);
    const persisted = await this.enqueueSnapshot(baseline, 'reset');
    await this.db.onClienteStateReset();
    resetClienteIds.forEach((clienteId) => {
      this.db.clienteOrderChangeListeners.forEach((listener) => {
        listener({ clienteId, reason: 'reset' });
      });
    });
    return persisted ? { status: 'reset' } : { status: 'degraded' };
  }

  getStatus(): DemoScenarioStatus {
    return { ...this.status };
  }

  getQaState(): QaScenarioState {
    return structuredClone(this.lastSnapshot.qa);
  }

  async setQaState(next: QaScenarioState): Promise<DemoScenarioMutationResult> {
    const qa = structuredClone(next);
    this.db.clienteQaState = qa;
    this.lastSnapshot = { ...this.lastSnapshot, qa: structuredClone(qa) };
    const persisted = await this.persist();
    return persisted ? { status: 'updated' } : { status: 'degraded' };
  }

  private captureSnapshot(): ClienteMockSnapshotV3 {
    this.rememberCurrentClienteIds();
    const accounts = this.db.clienteCredenciais.flatMap((credential) => {
      const profile = this.db.clientes.find((cliente) => cliente.id === credential.clienteId);
      if (!profile) return [];
      return [{ id: profile.id, email: credential.email, password: credential.password, profile }];
    });
    const clienteIds = new Set(accounts.map((account) => account.id));

    return structuredClone({
      ...this.lastSnapshot,
      accounts,
      sessionClienteId: this.db.sessionClienteId,
      orders: this.db.pedidos.filter((pedido) => clienteIds.has(pedido.cliente_id)),
      orderAutomation: this.db.clienteOrderAutomation,
      favoriteHubIds: this.db.favoriteHubIds,
      favoriteStoreIds: this.db.favoriteStoreIds,
      qa: this.db.clienteQaState,
    });
  }

  private enqueueSnapshot(snapshot: ClienteMockSnapshotV3, error: PersistenceError): Promise<boolean> {
    const payload = JSON.stringify(structuredClone(snapshot));
    const writeResult = this.writeQueue.then(async () => {
      try {
        await this.storage.setItem(CLIENTE_MOCK_STATE_KEY, payload);
        this.status = { hydrated: this.hydrated, persistence: 'ready', lastError: null };
        return true;
      } catch {
        this.status = { hydrated: this.hydrated, persistence: 'degraded', lastError: error };
        return false;
      }
    });
    this.writeQueue = writeResult.then(() => undefined);
    return writeResult;
  }

  private connectMutationPersistence(): void {
    this.db.onClienteMutation = () => this.persist().then(() => undefined);
  }

  private rememberCurrentClienteIds(): void {
    this.db.clienteCredenciais.forEach((credential) => this.managedClienteIds.add(credential.clienteId));
  }

  private rememberSnapshotClienteIds(snapshot: ClienteMockSnapshotV3): void {
    snapshot.accounts.forEach((account) => this.managedClienteIds.add(account.id));
  }

  private removeManagedClienteDomain(): void {
    this.db.clientes = this.db.clientes.filter((cliente) => !this.managedClienteIds.has(cliente.id));
    this.db.clienteCredenciais = this.db.clienteCredenciais.filter(
      (credential) => !this.managedClienteIds.has(credential.clienteId),
    );
    this.db.pedidos = this.db.pedidos.filter((pedido) => !this.managedClienteIds.has(pedido.cliente_id));
  }

  private reconcileHydratedOrders(): boolean {
    const nowMs = Date.now() + this.db.clienteQaState.clockOffsetMs;
    let changed = false;

    for (const [orderId, runtime] of Object.entries(this.db.clienteOrderAutomation)) {
      const orderIndex = this.db.pedidos.findIndex((pedido) => pedido.id === orderId);
      if (orderIndex < 0) continue;

      const reconciled = reconcileAutomaticOrder(
        this.db.pedidos[orderIndex]!,
        runtime,
        this.db.clienteQaState,
        nowMs,
      );
      if (reconciled.transitions.length === 0) continue;

      this.db.pedidos[orderIndex] = reconciled.pedido;
      if (reconciled.runtime === null) {
        delete this.db.clienteOrderAutomation[orderId];
      } else {
        this.db.clienteOrderAutomation[orderId] = reconciled.runtime;
      }
      changed = true;
    }

    return changed;
  }
}
