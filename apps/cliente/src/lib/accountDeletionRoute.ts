import type { AccountDeletionPort, AccountDeletionRecord, AuthPort, Cliente } from '@keepit/core-data';

export type AccountDeletionLookup =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'resolved'; deletion: AccountDeletionRecord | null };

export type AccountRoute = 'Auth' | 'Main' | 'ScheduledDeletion';

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
  onScheduled?.(deletion);
  await auth.signOut();
  return deletion;
}
