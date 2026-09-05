import type { AccountDeletionPort, AccountDeletionRecord, AuthPort, Cliente } from '@keepit/core-data';

export type AccountDeletionLookup =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'resolved'; deletion: AccountDeletionRecord | null };

export type AccountRoute = 'Auth' | 'Main' | 'ScheduledDeletion';

type AccountDeletionPersistedListener = (deletion: AccountDeletionRecord) => void;

const accountDeletionPersistedListeners = new Set<AccountDeletionPersistedListener>();

export function subscribeAccountDeletionPersisted(
  listener: AccountDeletionPersistedListener,
): () => void {
  accountDeletionPersistedListeners.add(listener);
  return () => accountDeletionPersistedListeners.delete(listener);
}

function notifyAccountDeletionPersisted(deletion: AccountDeletionRecord): void {
  accountDeletionPersistedListeners.forEach((listener) => listener(deletion));
}

export function resolveAccountRoute(
  session: Cliente | null | undefined,
  lookup: AccountDeletionLookup,
): AccountRoute {
  if (!session) return 'Auth';
  if (lookup.status !== 'resolved') return 'ScheduledDeletion';
  if (lookup.deletion === null || lookup.deletion.status === 'cancelled') return 'Main';
  return 'ScheduledDeletion';
}

export async function scheduleAccountDeletionAndSignOut(
  accountDeletion: Pick<AccountDeletionPort, 'schedule'>,
  auth: Pick<AuthPort, 'signOut'>,
  currentPassword: string,
  onScheduled?: (deletion: AccountDeletionRecord) => void,
): Promise<AccountDeletionRecord> {
  const deletion = await accountDeletion.schedule(currentPassword);
  notifyAccountDeletionPersisted(deletion);
  onScheduled?.(deletion);
  await auth.signOut();
  return deletion;
}
