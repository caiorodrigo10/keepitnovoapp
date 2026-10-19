import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { createAccountDeletionSupabase } from './account-deletion.supabase';

const SCHEDULED = {
  status: 'scheduled' as const,
  requestedAt: '2026-09-05T12:00:00.000Z',
  deleteAt: '2026-09-12T12:00:00.000Z',
};
const CANCELLED = { ...SCHEDULED, status: 'cancelled' as const };

function fakeClient(results: Array<{ data: unknown; error: { message: string } | null }>) {
  const queue = [...results];
  const invoke = vi.fn(async () => queue.shift() ?? { data: null, error: null });
  const client = { functions: { invoke } } as unknown as SupabaseClient<Database>;
  return { client, invoke };
}

describe('account-deletion.supabase', () => {
  it('consulta, agenda e cancela somente pela Edge Function account-deletion', async () => {
    const { client, invoke } = fakeClient([
      { data: null, error: null },
      { data: SCHEDULED, error: null },
      { data: CANCELLED, error: null },
    ]);
    const port = createAccountDeletionSupabase(client);

    await expect(port.status()).resolves.toBeNull();
    await expect(port.schedule('keepit123')).resolves.toEqual(SCHEDULED);
    await expect(port.cancel()).resolves.toEqual(CANCELLED);

    expect(invoke.mock.calls).toEqual([
      ['account-deletion', { body: { action: 'status' } }],
      ['account-deletion', { body: { action: 'schedule', currentPassword: 'keepit123' } }],
      ['account-deletion', { body: { action: 'cancel' } }],
    ]);
    expect(invoke.mock.calls.flat()).not.toContainEqual(expect.objectContaining({ clienteId: expect.anything() }));
  });

  it('preserva a idempotência devolvida pelo serviço sem recalcular o prazo', async () => {
    const { client } = fakeClient([
      { data: SCHEDULED, error: null },
      { data: SCHEDULED, error: null },
      { data: CANCELLED, error: null },
      { data: CANCELLED, error: null },
    ]);
    const port = createAccountDeletionSupabase(client);

    await expect(port.schedule('keepit123')).resolves.toEqual(SCHEDULED);
    await expect(port.schedule('keepit123')).resolves.toEqual(SCHEDULED);
    await expect(port.cancel()).resolves.toEqual(CANCELLED);
    await expect(port.cancel()).resolves.toEqual(CANCELLED);
  });

  it('não converte erro, corpo de erro ou resposta inválida em sucesso', async () => {
    const { client } = fakeClient([
      { data: null, error: { message: 'Edge Function retornou 503' } },
      { data: { error: { code: 'INVALID_PASSWORD' } }, error: null },
      { data: { ...SCHEDULED, deleteAt: 'não-é-data' }, error: null },
      { data: null, error: null },
    ]);
    const port = createAccountDeletionSupabase(client);

    await expect(port.status()).rejects.toThrow(/503/);
    await expect(port.schedule('incorreta')).rejects.toThrow(/INVALID_PASSWORD/);
    await expect(port.status()).rejects.toThrow(/resposta inválida/i);
    await expect(port.schedule('keepit123')).rejects.toThrow(/resposta vazia/i);
  });
});
