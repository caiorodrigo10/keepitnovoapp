import { describe, expect, it } from 'vitest';

import type { AccountDeletionRecord, Cliente } from '@keepit/core-data';

import {
  resolveAccountRoute,
  scheduleAccountDeletionAndSignOut,
  type AccountDeletionLookup,
} from './accountDeletionRoute';

const SESSION = { id: 'cliente-ana' } as Cliente;
const SCHEDULED: AccountDeletionRecord = {
  status: 'scheduled',
  requestedAt: '2026-09-05T12:00:00.000Z',
  deleteAt: '2026-09-12T12:00:00.000Z',
};

describe('resolveAccountRoute', () => {
  it('mantém usuário sem sessão na autenticação', () => {
    const lookup: AccountDeletionLookup = { status: 'resolved', deletion: SCHEDULED };

    expect(resolveAccountRoute(null, lookup)).toBe('Auth');
  });

  it.each<AccountDeletionLookup>([
    { status: 'loading' },
    { status: 'failed' },
  ])('falha fechada enquanto a exclusão não foi resolvida ($status)', (lookup) => {
    expect(resolveAccountRoute(SESSION, lookup)).toBe('ScheduledDeletion');
  });

  it.each(['scheduled', 'processing', 'completed', 'failed'] as const)(
    'restringe Main quando a exclusão está %s',
    (status) => {
      expect(
        resolveAccountRoute(SESSION, {
          status: 'resolved',
          deletion: { ...SCHEDULED, status },
        }),
      ).toBe('ScheduledDeletion');
    },
  );

  it.each<AccountDeletionLookup>([
    { status: 'resolved', deletion: null },
    { status: 'resolved', deletion: { ...SCHEDULED, status: 'cancelled' } },
  ])('libera Main somente sem exclusão ativa ($status)', (lookup) => {
    expect(resolveAccountRoute(SESSION, lookup)).toBe('Main');
  });
});

describe('scheduleAccountDeletionAndSignOut', () => {
  it('encerra a sessão somente depois que o agendamento resolve', async () => {
    const events: string[] = [];
    let finishSchedule!: (record: AccountDeletionRecord) => void;
    const schedule = new Promise<AccountDeletionRecord>((resolve) => {
      finishSchedule = resolve;
    });
    const result = scheduleAccountDeletionAndSignOut(
      {
        schedule: async () => {
          events.push('schedule:start');
          return schedule;
        },
      },
      {
        signOut: async () => {
          events.push('signout');
        },
      },
      'senha-atual',
    );

    await Promise.resolve();
    expect(events).toEqual(['schedule:start']);
    finishSchedule(SCHEDULED);

    await expect(result).resolves.toEqual(SCHEDULED);
    expect(events).toEqual(['schedule:start', 'signout']);
  });

  it('não encerra a sessão quando o agendamento falha', async () => {
    let signOutCalls = 0;

    await expect(
      scheduleAccountDeletionAndSignOut(
        { schedule: async () => Promise.reject(new Error('persistência indisponível')) },
        {
          signOut: async () => {
            signOutCalls += 1;
          },
        },
        'senha-atual',
      ),
    ).rejects.toThrow('persistência indisponível');
    expect(signOutCalls).toBe(0);
  });
});
