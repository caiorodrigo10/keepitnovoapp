import { describe, expect, it, vi } from 'vitest';

import { purgeAccountStorage, type DeletionFile } from './account-deletion-storage.ts';
import type { ClaimedDeletion } from '../process-account-deletions/types.ts';

const claim: ClaimedDeletion = {
  id: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222',
  policyVersion: 'test-mvp', leaseToken: '33333333-3333-4333-8333-333333333333', generation: 7,
  phase: 'data_purged', hasCliente: true, hasLojista: true,
};

const file = (index: number): DeletionFile => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  bucket: index % 2 === 0 ? 'fachadas' : 'produtos', path: `${claim.userId}/${index}.png`,
});

describe('purgeAccountStorage', () => {
  it('pages 201 current pending files without an offset and acknowledges only proved pages', async () => {
    let pending = Array.from({ length: 201 }, (_, index) => file(index));
    const next = vi.fn(async (_claim: ClaimedDeletion, limit: number) => pending.slice(0, limit));
    const ack = vi.fn(async (_claim: ClaimedDeletion, ids: string[]) => {
      pending = pending.filter((entry) => !ids.includes(entry.id));
    });
    const remove = vi.fn(async () => undefined);

    await purgeAccountStorage(claim, { next, ack, remove, exists: async () => false, renew: async () => true });

    expect(next.mock.calls.map(([, limit]) => limit)).toEqual([100, 100, 100, 100]);
    expect(remove).toHaveBeenCalledTimes(5);
    expect(ack.mock.calls.map(([, ids]) => ids.length)).toEqual([100, 100, 1]);
    expect(pending).toEqual([]);
  });

  it('leaves every file pending after a partial remove failure so replay retries the same paths', async () => {
    const first = file(1);
    const second = file(2);
    let pending = [first, second];
    const next = vi.fn(async () => pending.slice(0, 100));
    const ack = vi.fn(async (_claim: ClaimedDeletion, ids: string[]) => {
      pending = pending.filter((entry) => !ids.includes(entry.id));
    });
    const remove = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(undefined);
    const deps = { next, ack, remove, exists: async () => false, renew: async () => true };

    await expect(purgeAccountStorage(claim, deps)).rejects.toThrow('timeout');
    expect(ack).not.toHaveBeenCalled();
    await expect(purgeAccountStorage(claim, deps)).resolves.toBeUndefined();
    expect(remove.mock.calls.map(([, paths]) => paths)).toEqual([[first.path], [first.path], [second.path]]);
  });

  it('does not acknowledge a successful removal response while an object still exists', async () => {
    const next = vi.fn().mockResolvedValueOnce([file(1)]);
    const ack = vi.fn(async () => undefined);

    await expect(purgeAccountStorage(claim, {
      next, ack, remove: async () => undefined, exists: async () => true, renew: async () => true,
    })).rejects.toThrow('STORAGE_EXCLUSAO_NAO_CONFIRMADA');
    expect(ack).not.toHaveBeenCalled();
  });

  it('treats an already absent object as success but stops before deletion when its lease is lost', async () => {
    const next = vi.fn().mockResolvedValueOnce([file(1)]).mockResolvedValueOnce([]);
    const ack = vi.fn(async () => undefined);
    await expect(purgeAccountStorage(claim, {
      next, ack, remove: async () => undefined, exists: async () => false, renew: async () => true,
    })).resolves.toBeUndefined();
    expect(ack).toHaveBeenCalledWith(claim, [file(1).id]);

    const remove = vi.fn(async () => undefined);
    await expect(purgeAccountStorage(claim, {
      next: async () => [file(2)], ack, remove, exists: async () => false, renew: async () => false,
    })).rejects.toThrow('LEASE_PERDIDA');
    expect(remove).not.toHaveBeenCalled();
  });
});
