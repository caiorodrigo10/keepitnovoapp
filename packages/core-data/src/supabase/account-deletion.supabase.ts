import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  AccountDeletionPort,
  AccountDeletionRecord,
  AccountDeletionStatus,
} from '../ports/account-deletion.port';

type AccountDeletionErrorBody = { error: { code?: string; message?: string } };

const accountDeletionStatuses = new Set<AccountDeletionStatus>([
  'scheduled',
  'cancelled',
  'processing',
  'completed',
  'failed',
]);

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isAccountDeletionRecord(value: unknown): value is AccountDeletionRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    accountDeletionStatuses.has(record.status as AccountDeletionStatus) &&
    isIsoInstant(record.requestedAt) &&
    isIsoInstant(record.deleteAt)
  );
}

function isErrorBody(value: unknown): value is AccountDeletionErrorBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const error = (value as Record<string, unknown>).error;
  return !!error && typeof error === 'object' && !Array.isArray(error);
}

export function createAccountDeletionSupabase(
  client?: SupabaseClient<Database>,
): AccountDeletionPort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> =>
    cachedClient ?? (cachedClient = createClient());

  async function invoke(
    body: { action: 'status' | 'cancel' } | { action: 'schedule'; currentPassword: string },
    allowNull: boolean,
  ): Promise<AccountDeletionRecord | null> {
    const { data, error } = await resolveClient().functions.invoke<
      AccountDeletionRecord | AccountDeletionErrorBody | null
    >('account-deletion', { body });

    if (error) {
      throw new Error(`[core-data/supabase] account-deletion falhou: ${error.message}`);
    }
    if (isErrorBody(data)) {
      const detail = data.error.code ?? data.error.message ?? 'erro desconhecido';
      throw new Error(`[core-data/supabase] account-deletion falhou: ${detail}`);
    }
    if (data === null) {
      if (allowNull) return null;
      throw new Error('[core-data/supabase] account-deletion retornou resposta vazia.');
    }
    if (!isAccountDeletionRecord(data)) {
      throw new Error('[core-data/supabase] account-deletion retornou resposta inválida.');
    }
    return structuredClone(data);
  }

  return {
    status: () => invoke({ action: 'status' }, true),
    async schedule(currentPassword) {
      const record = await invoke({ action: 'schedule', currentPassword }, false);
      if (!record) throw new Error('[core-data/supabase] account-deletion retornou resposta vazia.');
      return record;
    },
    cancel: () => invoke({ action: 'cancel' }, true),
  };
}
