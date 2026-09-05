import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AccountDeletionRecord, Cliente } from '@keepit/core-data';

import {
  createAccountDeletionLookupCoordinator,
  resolveAccountRoute,
  scheduleAccountDeletionAndSignOut,
  setAccountDeletionGuardSession,
  subscribeAccountDeletionPersisted,
  type AccountDeletionLookup,
} from './accountDeletionRoute';

const SESSION: Cliente = {
  id: 'cliente-ana',
  nome: 'Ana Cliente',
  telefone: null,
  cpf: null,
  criado_em: '2026-09-05T10:00:00.000Z',
};
const SCHEDULED: AccountDeletionRecord = {
  status: 'scheduled',
  requestedAt: '2026-09-05T12:00:00.000Z',
  deleteAt: '2026-09-12T12:00:00.000Z',
};

const CANCELLED: AccountDeletionRecord = { ...SCHEDULED, status: 'cancelled' };

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

describe('account deletion lookup coordinator', () => {
  it('descarta status atrasado depois de um cancelamento autoritativo', () => {
    const coordinator = createAccountDeletionLookupCoordinator();
    const pendingStatus = coordinator.begin();

    const cancelledLookup = coordinator.commit(CANCELLED);

    expect(
      coordinator.complete(pendingStatus.requestId, { status: 'resolved', deletion: SCHEDULED }),
    ).toBeNull();
    expect(resolveAccountRoute(SESSION, cancelledLookup)).toBe('Main');
  });
});

describe('scheduleAccountDeletionAndSignOut', () => {
  beforeEach(() => setAccountDeletionGuardSession(SESSION.id));
  afterEach(() => setAccountDeletionGuardSession(null));

  it('ignora schedule da sessão anterior após relogin da mesma identidade', async () => {
    let finishSchedule!: (record: AccountDeletionRecord) => void;
    const schedulePending = new Promise<AccountDeletionRecord>((resolve) => {
      finishSchedule = resolve;
    });
    let notifications = 0;
    let localCallbacks = 0;
    let signOutCalls = 0;
    const unsubscribe = subscribeAccountDeletionPersisted(() => {
      notifications += 1;
    });

    try {
      const result = scheduleAccountDeletionAndSignOut(
        { schedule: async () => schedulePending },
        {
          currentUser: async () => SESSION,
          signOut: async () => {
            signOutCalls += 1;
          },
        },
        'senha-atual',
        () => {
          localCallbacks += 1;
        },
      );

      setAccountDeletionGuardSession(null);
      setAccountDeletionGuardSession(SESSION.id);
      finishSchedule(SCHEDULED);

      await expect(result).rejects.toBeInstanceOf(Error);
      expect({ notifications, localCallbacks, signOutCalls }).toEqual({
        notifications: 0,
        localCallbacks: 0,
        signOutCalls: 0,
      });
    } finally {
      unsubscribe();
    }
  });

  it('não encerra a sessão quando a identidade atual diverge da operação persistida', async () => {
    let localCallbacks = 0;
    let signOutCalls = 0;
    const auth = {
      currentUser: async () => ({ ...SESSION, id: 'cliente-bia' }),
      signOut: async () => {
        signOutCalls += 1;
      },
    };

    const result = scheduleAccountDeletionAndSignOut(
      { schedule: async () => SCHEDULED },
      auth,
      'senha-atual',
      () => {
        localCallbacks += 1;
      },
    );

    await expect(result).rejects.toBeInstanceOf(Error);
    expect({ localCallbacks, signOutCalls }).toEqual({ localCallbacks: 0, signOutCalls: 0 });
  });

  it('fecha o guard raiz antes do sign-out e permanece fechado se a saída falhar', async () => {
    const events: string[] = [];
    let lookup: AccountDeletionLookup = { status: 'resolved', deletion: null };
    let rejectSignOut!: (error: Error) => void;
    const signOutPending = new Promise<void>((_resolve, reject) => {
      rejectSignOut = reject;
    });
    const unsubscribe = subscribeAccountDeletionPersisted(({ deletion }) => {
      events.push('guard:scheduled');
      lookup = { status: 'resolved', deletion };
    });

    try {
      const result = scheduleAccountDeletionAndSignOut(
        { schedule: async () => SCHEDULED },
        {
          currentUser: async () => SESSION,
          signOut: async () => {
            events.push('signout:start');
            return signOutPending;
          },
        },
        'senha-atual',
      );

      await Promise.resolve();
      await Promise.resolve();

      expect(events).toEqual(['guard:scheduled', 'signout:start']);
      expect(resolveAccountRoute(SESSION, lookup)).toBe('ScheduledDeletion');

      rejectSignOut(new Error('signout indisponível'));
      await expect(result).rejects.toThrow('signout indisponível');
      expect(resolveAccountRoute(SESSION, lookup)).toBe('ScheduledDeletion');
    } finally {
      unsubscribe();
    }
  });

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
        currentUser: async () => SESSION,
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
          currentUser: async () => SESSION,
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
