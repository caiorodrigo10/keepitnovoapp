import type { AccountDeletionPort, AccountDeletionRecord, AuthPort, Cliente } from '@keepit/core-data';

export type AccountDeletionLookup =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'resolved'; deletion: AccountDeletionRecord | null };

export type AccountRoute = 'Auth' | 'Main' | 'ScheduledDeletion';

export type AccountDeletionGuardSession = Readonly<{
  clienteId: string;
  epoch: number;
}>;

let accountDeletionGuardEpoch = 0;
let accountDeletionGuardSession: AccountDeletionGuardSession | null = null;

export function setAccountDeletionGuardSession(clienteId: string | null): void {
  if ((accountDeletionGuardSession?.clienteId ?? null) === clienteId) return;
  accountDeletionGuardEpoch += 1;
  accountDeletionGuardSession = clienteId
    ? { clienteId, epoch: accountDeletionGuardEpoch }
    : null;
}

export function isAccountDeletionGuardSessionCurrent(
  session: AccountDeletionGuardSession,
): boolean {
  return (
    accountDeletionGuardSession?.clienteId === session.clienteId
    && accountDeletionGuardSession.epoch === session.epoch
  );
}

export function createAccountDeletionLookupCoordinator() {
  let currentRequestId = 0;

  return {
    begin(): { requestId: number; lookup: AccountDeletionLookup } {
      currentRequestId += 1;
      return { requestId: currentRequestId, lookup: { status: 'loading' } };
    },
    complete(requestId: number, lookup: AccountDeletionLookup): AccountDeletionLookup | null {
      return requestId === currentRequestId ? lookup : null;
    },
    commit(deletion: AccountDeletionRecord | null): AccountDeletionLookup {
      currentRequestId += 1;
      return { status: 'resolved', deletion };
    },
  };
}

export type AccountDeletionPersistedEvent = Readonly<{
  session: AccountDeletionGuardSession;
  deletion: AccountDeletionRecord;
}>;

type AccountDeletionPersistedListener = (event: AccountDeletionPersistedEvent) => void;

const accountDeletionPersistedListeners = new Set<AccountDeletionPersistedListener>();

export function subscribeAccountDeletionPersisted(
  listener: AccountDeletionPersistedListener,
): () => void {
  accountDeletionPersistedListeners.add(listener);
  return () => accountDeletionPersistedListeners.delete(listener);
}

function notifyAccountDeletionPersisted(event: AccountDeletionPersistedEvent): void {
  accountDeletionPersistedListeners.forEach((listener) => listener(event));
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
  auth: Pick<AuthPort, 'currentUser' | 'signOut'>,
  currentPassword: string,
  onScheduled?: (deletion: AccountDeletionRecord) => void,
): Promise<AccountDeletionRecord> {
  const startedSession = accountDeletionGuardSession;
  if (!startedSession) {
    throw new Error('[accountDeletion] sessão ativa indisponível');
  }
  const deletion = await accountDeletion.schedule(currentPassword);
  if (!isAccountDeletionGuardSessionCurrent(startedSession)) {
    throw new Error('[accountDeletion] sessão alterada durante o agendamento');
  }
  notifyAccountDeletionPersisted({ session: startedSession, deletion });
  const currentCliente = await auth.currentUser();
  if (currentCliente?.id !== startedSession.clienteId) {
    throw new Error('[accountDeletion] identidade alterada durante o agendamento');
  }
  if (!isAccountDeletionGuardSessionCurrent(startedSession)) {
    throw new Error('[accountDeletion] sessão alterada durante o agendamento');
  }
  onScheduled?.(deletion);
  if (!isAccountDeletionGuardSessionCurrent(startedSession)) {
    throw new Error('[accountDeletion] sessão alterada durante o agendamento');
  }
  await auth.signOut();
  return deletion;
}
