import type {
  AccountDeletionPort,
  AccountDeletionRecord,
} from '../ports/account-deletion.port';
import {
  readMockAccountDeletion,
  runMockAccountDeletionMutation,
  writeMockAccountDeletion,
} from './cliente-state';
import type { MockDb } from './db';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
const PERSISTENCE_ERROR = '[mock] Não foi possível persistir a exclusão da conta.';

function publicRecord(
  record: NonNullable<ReturnType<typeof readMockAccountDeletion>>,
): AccountDeletionRecord {
  const { clienteId: _clienteId, ...result } = record;
  return structuredClone(result);
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
      return db.runClienteMutation(async () => {
        const clienteId = requireSession();
        const record = readMockAccountDeletion(db);
        return record?.clienteId === clienteId ? publicRecord(record) : null;
      });
    },

    async schedule(currentPassword) {
      let result: AccountDeletionRecord | null = null;
      const persisted = await runMockAccountDeletionMutation(db, () => {
        const clienteId = requireSession();
        const credential = db.clienteCredenciais.find((item) => item.clienteId === clienteId);
        if (!credential || credential.password !== currentPassword) {
          throw new Error('[mock] Senha atual inválida.');
        }

        const previous = readMockAccountDeletion(db);
        if (
          previous?.clienteId === clienteId &&
          (previous.status === 'scheduled' || previous.status === 'processing')
        ) {
          result = publicRecord(previous);
          return null;
        }

        const requestedAtMs = Date.now() + db.clienteQaState.clockOffsetMs;
        const next = {
          clienteId,
          status: 'scheduled' as const,
          requestedAt: new Date(requestedAtMs).toISOString(),
          deleteAt: new Date(requestedAtMs + SEVEN_DAYS_MS).toISOString(),
        };
        writeMockAccountDeletion(db, next);
        result = publicRecord(next);
        return () => writeMockAccountDeletion(db, previous);
      });

      if (!persisted) throw new Error(PERSISTENCE_ERROR);
      if (!result) throw new Error('[mock] Exclusão de conta não pôde ser agendada.');
      return result;
    },

    async cancel() {
      let result: AccountDeletionRecord | null = null;
      const persisted = await runMockAccountDeletionMutation(db, () => {
        const clienteId = requireSession();
        const previous = readMockAccountDeletion(db);
        if (!previous || previous.clienteId !== clienteId) return null;
        if (previous.status !== 'scheduled') {
          result = publicRecord(previous);
          return null;
        }

        const next = { ...previous, status: 'cancelled' as const };
        writeMockAccountDeletion(db, next);
        result = publicRecord(next);
        return () => writeMockAccountDeletion(db, previous);
      });

      if (!persisted) throw new Error(PERSISTENCE_ERROR);
      return result;
    },
  };
}
