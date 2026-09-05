import type {
  DemoScenarioMutationResult,
  DemoScenarioResetResult,
  DemoScenarioStatus,
  QaScenarioState,
} from '../ports/demo-scenario.port';
import {
  CLIENTE_MOCK_STATE_KEY,
  applyClienteSnapshot,
  connectMockAccountDeletionMutation,
  connectMockPasswordRecoveryMutation,
  createClienteBaseline,
  decodeClienteSnapshot,
  readMockAccountDeletion,
  readMockPasswordRecovery,
  type ClienteMockSnapshotV6,
  type ClienteMockStorage,
  writeMockAccountDeletion,
} from './cliente-state';
import type { MockDb } from './db';
import { connectMockFavoriteMutation } from './favorites.mock';
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
  private stateMutationBarrier: Promise<void> = Promise.resolve();

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
    return this.stateMutationBarrier.then(() => this.persistNow());
  }

  private persistNow(): Promise<boolean> {
    const snapshot = this.captureSnapshot();
    this.lastSnapshot = structuredClone(snapshot);
    return this.enqueueSnapshot(snapshot, 'write');
  }

  flush(): Promise<void> {
    return this.stateMutationBarrier.then(() => this.writeQueue);
  }

  reset(): Promise<DemoScenarioResetResult> {
    return this.runSerializedStateMutation(() => this.resetNow());
  }

  private async resetNow(): Promise<DemoScenarioResetResult> {
    const previousSnapshot = this.captureSnapshot();
    const previousManagedClienteIds = [...this.managedClienteIds];
    const baseline = createClienteBaseline();
    const resetClienteIds = [...this.managedClienteIds];
    this.removeManagedClienteDomain();
    this.lastSnapshot = structuredClone(baseline);
    applyClienteSnapshot(this.db, baseline);
    this.managedClienteIds.clear();
    this.rememberSnapshotClienteIds(baseline);
    const persisted = await this.enqueueSnapshot(baseline, 'reset');
    if (!persisted) {
      this.removeManagedClienteDomain();
      this.managedClienteIds.clear();
      previousManagedClienteIds.forEach((clienteId) => this.managedClienteIds.add(clienteId));
      this.lastSnapshot = structuredClone(previousSnapshot);
      applyClienteSnapshot(this.db, previousSnapshot);
      return { status: 'degraded' };
    }

    await this.db.onClienteStateReset();
    resetClienteIds.forEach((clienteId) => {
      this.db.clienteOrderChangeListeners.forEach((listener) => {
        listener({ clienteId, reason: 'reset' });
      });
    });
    return { status: 'reset' };
  }

  getStatus(): DemoScenarioStatus {
    return { ...this.status };
  }

  getQaState(): QaScenarioState {
    return structuredClone(this.lastSnapshot.qa);
  }

  async setQaState(next: QaScenarioState): Promise<DemoScenarioMutationResult> {
    return this.runSerializedStateMutation(async () => {
      const qa = structuredClone(next);
      this.db.clienteQaState = qa;
      this.lastSnapshot = { ...this.lastSnapshot, qa: structuredClone(qa) };
      const persisted = await this.persistNow();
      return persisted ? { status: 'updated' } : { status: 'degraded' };
    });
  }

  async advanceClock(ms: number): Promise<DemoScenarioMutationResult> {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new Error('[mock] advanceClock exige milissegundos finitos e não negativos.');
    }

    const persisted = await this.runRollbackableStateMutation(() => {
      const previousQa = structuredClone(this.db.clienteQaState);
      const previousDeletion = readMockAccountDeletion(this.db);
      const previousProfile = previousDeletion
        ? this.db.clientes.find((cliente) => cliente.id === previousDeletion.clienteId)
        : undefined;
      const previousBlocked = previousProfile?.bloqueado;
      const previousBlockReason = previousProfile?.motivo_bloqueio;

      this.db.clienteQaState = {
        ...this.db.clienteQaState,
        clockOffsetMs: this.db.clienteQaState.clockOffsetMs + ms,
      };

      const nowMs = Date.now() + this.db.clienteQaState.clockOffsetMs;
      if (
        previousDeletion?.status === 'scheduled' &&
        Date.parse(previousDeletion.deleteAt) <= nowMs
      ) {
        writeMockAccountDeletion(this.db, { ...previousDeletion, status: 'completed' });
        if (previousProfile) {
          previousProfile.bloqueado = true;
          previousProfile.motivo_bloqueio = 'Conta excluída após o prazo de recuperação.';
        }
      }

      return () => {
        this.db.clienteQaState = previousQa;
        writeMockAccountDeletion(this.db, previousDeletion);
        if (previousProfile) {
          previousProfile.bloqueado = previousBlocked;
          previousProfile.motivo_bloqueio = previousBlockReason;
        }
      };
    });

    return persisted ? { status: 'updated' } : { status: 'degraded' };
  }

  private captureSnapshot(): ClienteMockSnapshotV6 {
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
      favoriteHubIdsByClienteId: Object.fromEntries(
        Object.entries(this.db.favoriteHubIdsByClienteId).filter(([clienteId]) => clienteIds.has(clienteId)),
      ),
      favoriteStoreIdsByClienteId: Object.fromEntries(
        Object.entries(this.db.favoriteStoreIdsByClienteId).filter(([clienteId]) => clienteIds.has(clienteId)),
      ),
      accountDeletion: readMockAccountDeletion(this.db),
      passwordRecovery: readMockPasswordRecovery(this.db),
      qa: this.db.clienteQaState,
    });
  }

  private enqueueSnapshot(snapshot: ClienteMockSnapshotV6, error: PersistenceError): Promise<boolean> {
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
    this.db.runClienteMutation = (run) =>
      this.runSerializedStateMutation(() => run(() => this.persistNow()));
    connectMockAccountDeletionMutation(this.db, (mutate) => this.runRollbackableStateMutation(mutate));
    connectMockPasswordRecoveryMutation(this.db, (mutate) => this.runRollbackableStateMutation(mutate));
    connectMockFavoriteMutation(this.db, (mutate) => this.runRollbackableStateMutation(mutate));
  }

  private runRollbackableStateMutation(mutate: () => (() => void) | null): Promise<boolean> {
    return this.runSerializedStateMutation(async () => {
      const rollback = mutate();
      if (!rollback) return true;
      try {
        const persisted = await this.persistNow();
        if (!persisted) {
          rollback();
          this.lastSnapshot = this.captureSnapshot();
        }
        return persisted;
      } catch {
        rollback();
        this.lastSnapshot = this.captureSnapshot();
        return false;
      }
    });
  }

  private runSerializedStateMutation<T>(run: () => T | Promise<T>): Promise<T> {
    const result = this.stateMutationBarrier.then(run);
    this.stateMutationBarrier = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private rememberCurrentClienteIds(): void {
    this.db.clienteCredenciais.forEach((credential) => this.managedClienteIds.add(credential.clienteId));
  }

  private rememberSnapshotClienteIds(snapshot: ClienteMockSnapshotV6): void {
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
