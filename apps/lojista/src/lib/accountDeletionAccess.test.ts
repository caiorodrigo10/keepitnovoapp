import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExclusaoAgendada from '../screens/auth/ExclusaoAgendada';
import ExcluirConta from '../screens/perfil/ExcluirConta';

// Use the installed web renderer without adding a typings dependency to the native app.
const { renderToStaticMarkup } = await vi.importActual<{
  renderToStaticMarkup(element: React.ReactNode): string;
}>('react-dom/server');

vi.mock('react-native', () => {
  const container = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return { View: container, Text: container, ScrollView: container, SafeAreaView: container, Pressable: container, ActivityIndicator: container, StyleSheet: { create: (value: unknown) => value } };
});
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children) }));
vi.mock('../components/FormField', () => ({ FormField: () => null }));
vi.mock('../context/CurrentStoreContext', () => ({ useCurrentStore: () => ({ id: 'store-a' }) }));
vi.mock('@keepit/ui-tokens', async () => { const { default: tokens } = await import('../../../../packages/ui-tokens/src/tokens.json'); return { darkColors: tokens.colors.dark, radii: tokens.radii, spacing: tokens.spacing, typography: tokens.typography }; });

import {
  createDeletionLookupCoordinator,
  resolveDeletionAccess,
  scheduleLojistaDeletion,
  recoverLojistaDeletion,
  publishDeletionPersisted,
  subscribeDeletionPersisted,
} from './accountDeletionAccess';

const scheduled = {
  status: 'scheduled' as const,
  requestedAt: '2026-10-01T00:00:00.000Z',
  deleteAt: '2026-10-08T00:00:00.000Z',
};

describe('lojista account deletion access', () => {
  it('keeps the store restricted until status resolves and on lookup failure', () => {
    expect(resolveDeletionAccess({ status: 'loading' })).toBe('restricted');
    expect(resolveDeletionAccess({ status: 'failed' })).toBe('restricted');
    expect(resolveDeletionAccess({ status: 'resolved', deletion: scheduled })).toBe('restricted');
    expect(resolveDeletionAccess({ status: 'resolved', deletion: null })).toBe('main');
    expect(resolveDeletionAccess({ status: 'resolved', deletion: { ...scheduled, status: 'cancelled' } })).toBe('main');
  });

  it('restricts access as soon as the request persists, before sign-out completes', async () => {
    const events: string[] = [];
    const schedule = vi.fn(async () => {
      events.push('persisted');
      return scheduled;
    });
    const signOut = vi.fn(async () => {
      events.push('signout');
      throw new Error('offline');
    });

    await expect(scheduleLojistaDeletion({ schedule }, { signOut }, 'senha', () => events.push('restricted')))
      .rejects.toThrow('offline');
    expect(events).toEqual(['persisted', 'restricted', 'signout']);
  });

  it('does not restore access when cancellation is refused after the deadline', async () => {
    const cancel = vi.fn(async () => ({ ...scheduled, status: 'processing' as const }));
    await expect(recoverLojistaDeletion({ cancel })).rejects.toThrow('PRAZO_ENCERRADO');
  });

  it('does not restore access when an expired request remains scheduled for pending review', async () => {
    await expect(recoverLojistaDeletion({ cancel: async () => scheduled })).rejects.toThrow('PRAZO_ENCERRADO');
  });

  it.each(['processing', 'failed', 'completed'] as const)('restricts access for persisted %s', (status) => {
    expect(resolveDeletionAccess({ status: 'resolved', deletion: { ...scheduled, status } })).toBe('restricted');
  });

  it('publishes persisted requests only to the active store subscriber', () => {
    const received: string[] = [];
    const unsubscribe = subscribeDeletionPersisted('store-a', (record) => received.push(record.status));
    publishDeletionPersisted('store-b', scheduled);
    publishDeletionPersisted('store-a', scheduled);
    unsubscribe();
    publishDeletionPersisted('store-a', scheduled);
    expect(received).toEqual(['scheduled']);
  });
});


describe("lojista deletion lookup coordinator", () => {
  it("mantém main durante a revalidação de uma consulta já resolvida sem exclusão", () => {
    const coordinator = createDeletionLookupCoordinator();
    const initial = coordinator.begin();
    expect(initial.lookup).toEqual({ status: "loading" });
    const resolved = coordinator.complete(initial.requestId, { status: "resolved", deletion: null });
    expect(resolved).toEqual({ status: "resolved", deletion: null });
    expect(resolveDeletionAccess(resolved!)).toBe("main");
    const revalidation = coordinator.begin();
    expect(revalidation.lookup).toEqual({ status: "resolved", deletion: null });
    expect(resolveDeletionAccess(revalidation.lookup)).toBe("main");
  });

  it("preserva o último estado resolvido quando a revalidação falha", () => {
    const coordinator = createDeletionLookupCoordinator();
    const initial = coordinator.begin();
    coordinator.complete(initial.requestId, { status: "resolved", deletion: null });
    const revalidation = coordinator.begin();
    const afterFailure = coordinator.complete(revalidation.requestId, { status: "failed" });
    expect(afterFailure).toEqual({ status: "resolved", deletion: null });
    expect(resolveDeletionAccess(afterFailure!)).toBe("main");
  });

  it("descarta conclusão atrasada e reset volta para loading", () => {
    const coordinator = createDeletionLookupCoordinator();
    const stale = coordinator.begin();
    const current = coordinator.begin();
    expect(coordinator.complete(stale.requestId, { status: "resolved", deletion: null })).toBeNull();
    expect(coordinator.complete(current.requestId, { status: "resolved", deletion: scheduled })).toEqual({ status: "resolved", deletion: scheduled });
    expect(coordinator.reset()).toEqual({ status: "loading" });
    expect(coordinator.begin().lookup).toEqual({ status: "loading" });
  });
});

describe('persisted deletion presentation in Lojista', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T23:59:59.000Z')); });
  afterEach(() => { vi.useRealTimers(); });
  const render = (status: 'scheduled' | 'processing' | 'failed' | 'completed' = 'scheduled') => renderToStaticMarkup(React.createElement(ExclusaoAgendada, {
    lookup: { status: 'resolved', deletion: { ...scheduled, status } }, onDeletionChange: () => {}, onRetry: () => {},
  }));
  it('informs the persisted cancellation deadline while recovery is available', () => {
    const html = render();
    expect(html).toContain('Você pode cancelar até 8 de outubro de 2026');
    expect(html).toContain('Recuperar minha conta');
  });
  it.each(['2026-10-08T00:00:00.000Z', '2026-10-09T00:00:00.000Z'])('hides recovery at or after the deadline (%s)', (now) => {
    vi.setSystemTime(new Date(now)); const html = render();
    expect(html).not.toContain('Recuperar minha conta');
    expect(html).toContain('O prazo para cancelar terminou. Sua solicitação aguarda processamento ou revisão de pendências.');
  });
  it.each(['processing', 'failed'] as const)('explains persisted %s without recovery', (status) => {
    const html = render(status);
    expect(html).toContain('Sua exclusão está em processamento. Uma falha temporária não cancela a solicitação.');
    expect(html).not.toContain('Recuperar minha conta');
  });
  it('presents persisted completion and minimal retention', () => {
    const html = render('completed');
    expect(html).toContain('Exclusão concluída');
    expect(html).toContain('cinco anos após o encerramento financeiro');
    expect(html).toContain('30 dias da criação');
    expect(html).toContain('não apaga os registros mantidos pelos processadores de pagamento');
    expect(html).not.toContain('Recuperar minha conta');
  });
  it('explains retention before requesting deletion with an authenticated real account', () => {
    vi.stubEnv('EXPO_PUBLIC_DATA_SOURCE', 'supabase');
    try {
      const html = renderToStaticMarkup(React.createElement(ExcluirConta, { navigation: {} as never, route: {} as never }));
      expect(html).toContain('cinco anos após o encerramento financeiro');
      expect(html).toContain('30 dias da criação');
      expect(html).toContain('não apaga os registros mantidos pelos processadores de pagamento');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
