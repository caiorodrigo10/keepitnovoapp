import { describe, expect, it, vi } from 'vitest';

import { processAccountDeletion } from './handler.ts';
import type { ClaimedDeletion } from './types.ts';

const claim: ClaimedDeletion = {
  id: '13131313-aaaa-4111-8111-111111111111',
  userId: '13131313-1111-4111-8111-111111111111',
  policyVersion: 'test-mvp',
  leaseToken: '13131313-bbbb-4111-8111-111111111111',
  generation: 1,
  phase: 'claimed',
  hasCliente: true,
  hasLojista: false,
};

function depsFor(phases: ClaimedDeletion['phase'][]) {
  const reload = vi.fn(async () => ({ ...claim, phase: phases.shift() ?? 'completed' }));
  return {
    reload,
    renew: vi.fn(async () => true),
    purgeCards: vi.fn(async () => undefined),
    applyData: vi.fn(async () => undefined),
    purgeStorage: vi.fn(async () => undefined),
    deleteAuth: vi.fn(async () => undefined),
    advance: vi.fn(async () => undefined),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  };
}

describe('processAccountDeletion', () => {
  it('dispatches every persisted checkpoint in order before completion', async () => {
    const deps = depsFor(['cards_purged', 'data_purged', 'storage_purged', 'auth_deleted']);

    await expect(processAccountDeletion(claim, deps as never)).resolves.toEqual({ completed: true, retryable: false });
    expect(deps.purgeCards).toHaveBeenCalledWith(claim);
    expect(deps.applyData).toHaveBeenCalledWith({ ...claim, phase: 'cards_purged' });
    expect(deps.purgeStorage).toHaveBeenCalledWith({ ...claim, phase: 'data_purged' });
    expect(deps.advance).toHaveBeenNthCalledWith(1, { ...claim, phase: 'data_purged' }, 'storage_purged');
    expect(deps.deleteAuth).toHaveBeenCalledWith({ ...claim, phase: 'storage_purged' });
    expect(deps.advance).toHaveBeenNthCalledWith(2, { ...claim, phase: 'storage_purged' }, 'auth_deleted');
    expect(deps.complete).toHaveBeenCalledWith({ ...claim, phase: 'auth_deleted' });
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it('records a closed failure and never completes when data redaction fails', async () => {
    const deps = depsFor(['cards_purged']);
    deps.applyData.mockRejectedValueOnce(new Error('database interrupted'));

    await expect(processAccountDeletion(claim, deps as never)).resolves.toEqual({
      completed: false, retryable: true, code: 'REDACAO_DADOS_FALHOU',
    });
    expect(deps.purgeStorage).not.toHaveBeenCalled();
    expect(deps.deleteAuth).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.fail).toHaveBeenCalledWith({ ...claim, phase: 'cards_purged' }, 'REDACAO_DADOS_FALHOU');
  });

  it('stops before an effect when the active lease cannot be renewed', async () => {
    const deps = depsFor([]);
    deps.renew.mockResolvedValueOnce(false);

    await expect(processAccountDeletion(claim, deps as never)).resolves.toEqual({
      completed: false, retryable: true, code: 'LEASE_PERDIDA',
    });
    expect(deps.purgeCards).not.toHaveBeenCalled();
    expect(deps.fail).not.toHaveBeenCalled();
  });
});
