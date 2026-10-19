import { describe, expect, it, vi } from 'vitest';

import { AccountDeletionRepository } from './repository.ts';
import type { ClaimedDeletion } from './types.ts';

const claim: ClaimedDeletion = {
  id: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222',
  policyVersion: 'test-mvp', leaseToken: '33333333-3333-4333-833333333333', generation: 7,
  phase: 'data_purged', hasCliente: true, hasLojista: false,
};

describe('AccountDeletionRepository', () => {
  it('runs the bounded retention-expiry RPC and exposes only aggregate counts', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { expired: 2, pending: 3 }, error: null });
    const repository = new AccountDeletionRepository({ rpc });
    const expiry = repository as AccountDeletionRepository & {
      expireRetention(limit: number): Promise<{ expired: number; pending: number }>;
    };

    await expect(expiry.expireRetention(2)).resolves.toEqual({ expired: 2, pending: 3 });
    expect(rpc).toHaveBeenCalledWith('expire_account_deletion_retention', { p_limit: 2 });
  });

  it('rejects a malformed retention-expiry result instead of reporting invented counts', async () => {
    const repository = new AccountDeletionRepository({
      rpc: vi.fn().mockResolvedValue({ data: { expired: -1, pending: 'unknown' }, error: null }),
    });
    const expiry = repository as AccountDeletionRepository & {
      expireRetention(limit: number): Promise<{ expired: number; pending: number }>;
    };

    await expect(expiry.expireRetention(1)).rejects.toThrow('CONTAGENS_RETENCAO_INVALIDAS');
  });

  it('maps a camel-case claim to fenced RPC arguments and validates manifest records', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'f1', bucket: 'fachadas', path: `${claim.userId}/f1.png` }], error: null });
    const repository = new AccountDeletionRepository({ rpc });

    await expect(repository.listFiles(claim)).resolves.toEqual([{ id: 'f1', bucket: 'fachadas', path: `${claim.userId}/f1.png` }]);
    expect(rpc).toHaveBeenCalledWith('list_account_deletion_files', {
      p_request_id: claim.id, p_lease_token: claim.leaseToken, p_generation: claim.generation, p_limit: 100,
    });
  });

  it('rejects malformed RPC data rather than allowing arbitrary bucket/path deletion', async () => {
    const repository = new AccountDeletionRepository({
      rpc: vi.fn().mockResolvedValue({ data: [{ id: 'f1', bucket: 'hubs', path: '../shared' }], error: null }),
    });

    await expect(repository.listFiles(claim)).rejects.toThrow('MANIFESTO_STORAGE_INVALIDO');
  });

  it('passes the current fence for acknowledgement, phase advance, and lease renewal', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const repository = new AccountDeletionRepository({ rpc });

    await repository.acknowledgeFiles(claim, ['f1']);
    await repository.advance(claim, 'storage_purged');
    await expect(repository.renew(claim)).resolves.toBe(true);
    expect(rpc.mock.calls).toEqual([
      ['ack_account_deletion_files', { p_request_id: claim.id, p_lease_token: claim.leaseToken, p_generation: 7, p_file_ids: ['f1'] }],
      ['advance_account_deletion', { p_request_id: claim.id, p_lease_token: claim.leaseToken, p_generation: 7, p_phase: 'storage_purged' }],
      ['renew_account_deletion', { p_request_id: claim.id, p_lease_token: claim.leaseToken, p_generation: 7 }],
    ]);
  });
});
