import type { AccountDeletionPort, AccountDeletionRecord, LojistaAuthPort } from '@keepit/core-data';

export type DeletionLookup =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'resolved'; deletion: AccountDeletionRecord | null };

export function createDeletionLookupCoordinator() {
  let currentRequestId = 0;
  let lastResolvedLookup: DeletionLookup | null = null;

  return {
    begin(): { requestId: number; lookup: DeletionLookup } {
      currentRequestId += 1;
      return { requestId: currentRequestId, lookup: lastResolvedLookup ?? { status: 'loading' } };
    },
    complete(requestId: number, lookup: DeletionLookup): DeletionLookup | null {
      if (requestId !== currentRequestId) return null;
      if (lookup.status === 'resolved') {
        lastResolvedLookup = lookup;
        return lookup;
      }
      return lastResolvedLookup ?? lookup;
    },
    commit(deletion: AccountDeletionRecord | null): DeletionLookup {
      currentRequestId += 1;
      lastResolvedLookup = { status: 'resolved', deletion };
      return lastResolvedLookup;
    },
    reset(): DeletionLookup {
      currentRequestId += 1;
      lastResolvedLookup = null;
      return { status: 'loading' };
    },
  };
}

type PersistedListener = { storeId: string; callback: (record: AccountDeletionRecord) => void };
const persistedListeners = new Set<PersistedListener>();

export function subscribeDeletionPersisted(
  storeId: string,
  callback: (record: AccountDeletionRecord) => void,
): () => void {
  const listener = { storeId, callback };
  persistedListeners.add(listener);
  return () => persistedListeners.delete(listener);
}

export function publishDeletionPersisted(storeId: string, record: AccountDeletionRecord): void {
  persistedListeners.forEach((listener) => {
    if (listener.storeId === storeId) listener.callback(record);
  });
}

export function resolveDeletionAccess(lookup: DeletionLookup): 'main' | 'restricted' {
  if (lookup.status !== 'resolved') return 'restricted';
  if (lookup.deletion === null || lookup.deletion.status === 'cancelled') return 'main';
  return 'restricted';
}

export async function scheduleLojistaDeletion(
  deletion: Pick<AccountDeletionPort, 'schedule'>,
  auth: Pick<LojistaAuthPort, 'signOut'>,
  password: string,
  onPersisted: (record: AccountDeletionRecord) => void,
): Promise<AccountDeletionRecord> {
  const record = await deletion.schedule(password);
  onPersisted(record);
  await auth.signOut();
  return record;
}

export async function recoverLojistaDeletion(
  deletion: Pick<AccountDeletionPort, 'cancel'>,
): Promise<AccountDeletionRecord | null> {
  const record = await deletion.cancel();
  if (record !== null && record.status !== 'cancelled') {
    throw new Error('PRAZO_ENCERRADO');
  }
  return record;
}
