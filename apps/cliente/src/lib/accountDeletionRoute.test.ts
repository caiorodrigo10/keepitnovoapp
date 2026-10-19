import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountDeletionRecord, Cliente } from '@keepit/core-data';
import ExclusaoAgendada from '../screens/auth/ExclusaoAgendada';
import ExcluirConta from '../screens/perfil/ExcluirConta';

const deletionClient = vi.hoisted(() => ({ cancel: vi.fn(), signOut: vi.fn() }));
vi.mock('@keepit/core-data', () => ({ getDataClient: () => ({ accountDeletion: deletionClient, auth: deletionClient }) }));
vi.mock('react-native', () => ({ Text: 'Text', View: 'View', StyleSheet: { create: (value: unknown) => value } }));
vi.mock('../components/ui', () => ({ AppHeader: 'AppHeader', Button: 'Button', Screen: 'Screen', FormScreen: 'FormScreen', TextField: 'TextField', Checkbox: 'Checkbox' }));
vi.mock('@keepit/ui-tokens', async () => { const { default: tokens } = await import('../../../../packages/ui-tokens/src/tokens.json'); return { lightColors: tokens.colors.light, radii: tokens.radii, spacing: tokens.spacing, typography: tokens.typography }; });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  it('mantém a rota Main durante a revalidação de uma consulta já resolvida', () => {
    const coordinator = createAccountDeletionLookupCoordinator();
    const initialLookup = coordinator.begin();
    const resolvedLookup = coordinator.complete(initialLookup.requestId, {
      status: 'resolved',
      deletion: null,
    });

    expect(resolveAccountRoute(SESSION, resolvedLookup!)).toBe('Main');

    const revalidation = coordinator.begin();

    expect(resolveAccountRoute(SESSION, revalidation.lookup)).toBe('Main');
  });

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

describe('persisted deletion presentation in Cliente', () => {
  let renderer: ReactTestRenderer;
  const deadline = '2026-10-08T00:00:00.000Z';
  const record: AccountDeletionRecord = { status: 'scheduled', requestedAt: '2026-10-01T00:00:00.000Z', deleteAt: deadline };
  let lookup: AccountDeletionLookup;
  const onDeletionChange = (deletion: AccountDeletionRecord | null) => { lookup = { status: 'resolved', deletion }; };
  async function render(deletion = record) {
    lookup = { status: 'resolved', deletion };
    await act(async () => { renderer = create(React.createElement(ExclusaoAgendada, { lookup, onDeletionChange, onRetry: () => {}, navigation: {} as never, route: {} as never })); });
  }
  const text = () => renderer.root.findAllByType('Text' as never).map((node) => node.children.join('')).join(' ');
  const recover = () => renderer.root.findAllByType('Button' as never).filter((node) => node.props.title === 'Recuperar minha conta');
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T23:59:59.000Z')); });
  afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); vi.useRealTimers(); vi.clearAllMocks(); });

  it('informs the persisted cancellation deadline before it expires', async () => {
    await render();
    expect(text()).toContain('Você pode cancelar até 8 de outubro de 2026');
    expect(recover()).toHaveLength(1);
  });
  it.each(['2026-10-08T00:00:00.000Z', '2026-10-09T00:00:00.000Z'])(
    'hides recovery at or after the persisted deadline (%s)', async (now) => {
      vi.setSystemTime(new Date(now)); await render();
      expect(recover()).toHaveLength(0);
      expect(text()).toContain('O prazo para cancelar terminou. Sua solicitação aguarda processamento ou revisão de pendências.');
    },
  );
  it('removes recovery when the deadline elapses while the screen is open', async () => {
    await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(recover()).toHaveLength(0);
  });
  it.each(['processing', 'failed'] as const)('explains persisted %s without restoring access', async (status) => {
    await render({ ...record, status });
    expect(text()).toContain('Sua exclusão está em processamento. Uma falha temporária não cancela a solicitação.');
    expect(recover()).toHaveLength(0);
  });
  it('presents persisted completion rather than an expired recovery window', async () => {
    await render({ ...record, status: 'completed' });
    expect(text()).toContain('Exclusão concluída');
    expect(text()).not.toContain('aguarda processamento');
    expect(recover()).toHaveLength(0);
  });
  it('keeps Main restricted when the server refuses cancellation despite a future local deadline', async () => {
    deletionClient.cancel.mockResolvedValue({ ...record, status: 'processing' });
    await render();
    await act(async () => { recover()[0]!.props.onPress(); });
    expect(resolveAccountRoute(SESSION, lookup)).toBe('ScheduledDeletion');
    expect(text()).toContain('não pode mais ser cancelada');
  });
  it('explains minimal financial and provider retention before requesting deletion', async () => {
    await act(async () => { renderer = create(React.createElement(ExcluirConta, { navigation: {} as never, route: {} as never })); });
    expect(text()).toContain('cinco anos após o encerramento financeiro');
    expect(text()).toContain('30 dias da criação');
    expect(text()).toContain('não apaga os registros mantidos pelos processadores de pagamento');
  });
});
