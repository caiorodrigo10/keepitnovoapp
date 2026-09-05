export type AccountDeletionStatus = 'scheduled' | 'cancelled' | 'processing' | 'completed' | 'failed';

export interface AccountDeletionRecord {
  status: AccountDeletionStatus;
  requestedAt: string;
  deleteAt: string;
}

export interface AccountDeletionRepository {
  status(userId: string): Promise<AccountDeletionRecord | null>;
  schedule(userId: string): Promise<AccountDeletionRecord>;
  cancel(userId: string): Promise<AccountDeletionRecord | null>;
}

export interface AuthenticatedIdentity {
  id: string;
  email: string;
}

export interface ReauthenticatedIdentity {
  id: string;
}

export type AccountDeletionInput = {
  action: 'status' | 'schedule' | 'cancel';
  currentPassword?: string;
};

const ACCOUNT_DELETION_ACTIONS = ['status', 'schedule', 'cancel'] as const;

export function parseAccountDeletionInput(value: unknown): AccountDeletionInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== 'action' && key !== 'currentPassword')) return null;
  if (!ACCOUNT_DELETION_ACTIONS.includes(body.action as AccountDeletionInput['action'])) return null;
  if (body.currentPassword !== undefined && typeof body.currentPassword !== 'string') return null;

  return body.currentPassword === undefined
    ? { action: body.action as AccountDeletionInput['action'] }
    : {
        action: body.action as AccountDeletionInput['action'],
        currentPassword: body.currentPassword,
      };
}

export type AccountDeletionResult =
  | { ok: true; data: AccountDeletionRecord | null }
  | { ok: false; error: { status: number; code: string } };

export interface AccountDeletionDependencies {
  repository: AccountDeletionRepository;
  reauthenticate(email: string, password: string): Promise<ReauthenticatedIdentity | null>;
}

export async function handleAccountDeletion(
  input: AccountDeletionInput,
  authenticated: AuthenticatedIdentity,
  deps: AccountDeletionDependencies,
): Promise<AccountDeletionResult> {
  try {
    if (input.action === 'status') {
      return { ok: true, data: await deps.repository.status(authenticated.id) };
    }

    if (input.action === 'cancel') {
      return { ok: true, data: await deps.repository.cancel(authenticated.id) };
    }

    if (!input.currentPassword) {
      return { ok: false, error: { status: 400, code: 'PASSWORD_REQUIRED' } };
    }

    const reauthenticated = await deps.reauthenticate(authenticated.email, input.currentPassword);
    if (!reauthenticated) {
      return { ok: false, error: { status: 401, code: 'INVALID_PASSWORD' } };
    }
    if (reauthenticated.id !== authenticated.id) {
      return { ok: false, error: { status: 403, code: 'IDENTITY_MISMATCH' } };
    }

    return { ok: true, data: await deps.repository.schedule(authenticated.id) };
  } catch {
    return { ok: false, error: { status: 503, code: 'PERSISTENCE_FAILED' } };
  }
}
