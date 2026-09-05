import { describe, expect, it, vi } from 'vitest';

import {
  handleAccountDeletion,
  parseAccountDeletionInput,
  type AccountDeletionRecord,
  type AccountDeletionRepository,
  type ReauthenticatedIdentity,
} from './handler';

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'ana@example.com' };
const SCHEDULED: AccountDeletionRecord = {
  status: 'scheduled',
  requestedAt: '2026-09-05T12:00:00.000Z',
  deleteAt: '2026-09-12T12:00:00.000Z',
};

function repository(overrides: Partial<AccountDeletionRepository> = {}): AccountDeletionRepository {
  return {
    status: vi.fn(async () => null),
    schedule: vi.fn(async () => SCHEDULED),
    cancel: vi.fn(async () => null),
    ...overrides,
  };
}

describe('handleAccountDeletion', () => {
  it('recusa corpo nulo e aceita somente ações conhecidas', () => {
    expect(parseAccountDeletionInput(null)).toBeNull();
    expect(parseAccountDeletionInput({ action: 'unknown' })).toBeNull();
    expect(parseAccountDeletionInput({ action: 'status', clienteId: USER.id })).toBeNull();
    expect(parseAccountDeletionInput({ action: 'schedule', currentPassword: 123 })).toBeNull();
    expect(parseAccountDeletionInput({ action: 'status' })).toEqual({ action: 'status' });
  });

  it('consulta somente o estado do usuário derivado do JWT', async () => {
    const status = vi.fn(async () => SCHEDULED);
    const result = await handleAccountDeletion(
      { action: 'status' },
      USER,
      { repository: repository({ status }), reauthenticate: vi.fn() },
    );

    expect(result).toEqual({ ok: true, data: SCHEDULED });
    expect(status).toHaveBeenCalledWith(USER.id);
  });

  it('recusa agendamento quando a senha é inválida e não persiste', async () => {
    const schedule = vi.fn();
    const result = await handleAccountDeletion(
      { action: 'schedule', currentPassword: 'incorreta' },
      USER,
      {
        repository: repository({ schedule: schedule as AccountDeletionRepository['schedule'] }),
        reauthenticate: vi.fn(async () => null),
      },
    );

    expect(result).toEqual({ ok: false, error: { status: 401, code: 'INVALID_PASSWORD' } });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('recusa identidade reautenticada diferente da identidade do JWT', async () => {
    const schedule = vi.fn();
    const other: ReauthenticatedIdentity = { id: '22222222-2222-4222-8222-222222222222' };
    const result = await handleAccountDeletion(
      { action: 'schedule', currentPassword: 'keepit123' },
      USER,
      {
        repository: repository({ schedule: schedule as AccountDeletionRepository['schedule'] }),
        reauthenticate: vi.fn(async () => other),
      },
    );

    expect(result).toEqual({ ok: false, error: { status: 403, code: 'IDENTITY_MISMATCH' } });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('agenda de forma idempotente retornando o prazo já persistido', async () => {
    const schedule = vi.fn(async () => SCHEDULED);
    const reauthenticate = vi.fn(async () => ({ id: USER.id }));
    const deps = { repository: repository({ schedule }), reauthenticate };

    const first = await handleAccountDeletion(
      { action: 'schedule', currentPassword: 'keepit123' }, USER, deps,
    );
    const second = await handleAccountDeletion(
      { action: 'schedule', currentPassword: 'keepit123' }, USER, deps,
    );

    expect(first).toEqual({ ok: true, data: SCHEDULED });
    expect(second).toEqual({ ok: true, data: SCHEDULED });
    expect(reauthenticate).toHaveBeenCalledWith(USER.email, 'keepit123');
    expect(schedule).toHaveBeenNthCalledWith(1, USER.id);
    expect(schedule).toHaveBeenNthCalledWith(2, USER.id);
  });

  it('cancelar repetidamente é idempotente', async () => {
    const cancel = vi.fn(async () => null);
    const deps = { repository: repository({ cancel }), reauthenticate: vi.fn() };

    const first = await handleAccountDeletion({ action: 'cancel' }, USER, deps);
    const second = await handleAccountDeletion({ action: 'cancel' }, USER, deps);

    expect(first).toEqual({ ok: true, data: null });
    expect(second).toEqual({ ok: true, data: null });
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledWith(USER.id);
  });

  it('falha de persistência nunca é apresentada como sucesso', async () => {
    const result = await handleAccountDeletion(
      { action: 'schedule', currentPassword: 'keepit123' },
      USER,
      {
        repository: repository({ schedule: vi.fn(async () => { throw new Error('db down'); }) }),
        reauthenticate: vi.fn(async () => ({ id: USER.id })),
      },
    );

    expect(result).toEqual({ ok: false, error: { status: 503, code: 'PERSISTENCE_FAILED' } });
  });
});
