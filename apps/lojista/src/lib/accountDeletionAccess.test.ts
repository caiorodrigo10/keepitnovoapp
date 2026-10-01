import { describe, expect, it, vi } from 'vitest';

import {
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
