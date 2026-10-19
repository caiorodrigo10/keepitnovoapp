import type {
  AccountDeletionPort,
  AccountDeletionRecord,
} from '../ports/account-deletion.port';
import {
  readMockAccountDeletion,
  reconcileDueMockAccountDeletions,
  runMockAccountDeletionMutation,
  writeMockAccountDeletion,
} from './cliente-state';
import type { MockDb } from './db';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
const PERSISTENCE_ERROR = '[mock] Não foi possível persistir a exclusão da conta.';

function publicRecord(record: AccountDeletionRecord): AccountDeletionRecord {
  return structuredClone(record);
}

function combineRollbacks(...rollbacks: Array<(() => void) | null>): (() => void) | null {
  const available = rollbacks.filter((rollback): rollback is () => void => rollback !== null);
  if (available.length === 0) return null;
  return () => available.slice().reverse().forEach((rollback) => rollback());
}

export function createAccountDeletionMock(db: MockDb): AccountDeletionPort {
  function requireSession(): string {
    if (!db.sessionClienteId) {
      throw new Error('[mock] Exclusão de conta exige sessão autenticada.');
    }
    return db.sessionClienteId;
  }

  return {
    async status() {
      let result: AccountDeletionRecord | null = null;
      const persisted = await runMockAccountDeletionMutation(db, () => {
        const clienteId = requireSession();
        const rollbackReconciliation = reconcileDueMockAccountDeletions(db);
        const record = readMockAccountDeletion(db, clienteId);
        result = record ? publicRecord(record) : null;
        return rollbackReconciliation;
      });

      if (!persisted) throw new Error(PERSISTENCE_ERROR);
      return result;
    },

    async schedule(currentPassword) {
      let result: AccountDeletionRecord | null = null;
      const persisted = await runMockAccountDeletionMutation(db, () => {
        const clienteId = requireSession();
        const credential = db.clienteCredenciais.find((item) => item.clienteId === clienteId);
        if (!credential || credential.password !== currentPassword) {
          throw new Error('[mock] Senha atual inválida.');
        }

        const rollbackReconciliation = reconcileDueMockAccountDeletions(db);
        const previous = readMockAccountDeletion(db, clienteId);
        if (
          previous &&
          (previous.status === 'scheduled' || previous.status === 'processing')
        ) {
          result = publicRecord(previous);
          return rollbackReconciliation;
        }

        const requestedAtMs = Date.now() + db.clienteQaState.clockOffsetMs;
        const next = {
          status: 'scheduled' as const,
          requestedAt: new Date(requestedAtMs).toISOString(),
          deleteAt: new Date(requestedAtMs + SEVEN_DAYS_MS).toISOString(),
        };
        writeMockAccountDeletion(db, clienteId, next);
        result = publicRecord(next);
        return combineRollbacks(
          rollbackReconciliation,
          () => writeMockAccountDeletion(db, clienteId, previous),
        );
      });

      if (!persisted) throw new Error(PERSISTENCE_ERROR);
      if (!result) throw new Error('[mock] Exclusão de conta não pôde ser agendada.');
      return result;
    },

    async cancel() {
      let result: AccountDeletionRecord | null = null;
      const persisted = await runMockAccountDeletionMutation(db, () => {
        const clienteId = requireSession();
        const rollbackReconciliation = reconcileDueMockAccountDeletions(db);
        const previous = readMockAccountDeletion(db, clienteId);
        if (!previous) return rollbackReconciliation;
        if (previous.status !== 'scheduled') {
          result = publicRecord(previous);
          return rollbackReconciliation;
        }

        const next = { ...previous, status: 'cancelled' as const };
        writeMockAccountDeletion(db, clienteId, next);
        result = publicRecord(next);
        return combineRollbacks(
          rollbackReconciliation,
          () => writeMockAccountDeletion(db, clienteId, previous),
        );
      });

      if (!persisted) throw new Error(PERSISTENCE_ERROR);
      return result;
    },
  };
}
