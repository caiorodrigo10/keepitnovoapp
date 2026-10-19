import { describe, expect, it, vi } from 'vitest';

import { deleteAccountAuth } from './account-deletion-auth.ts';

describe('deleteAccountAuth', () => {
  it('requires an administrative absence check after a lost delete response', async () => {
    const exists = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const deps = { remove: vi.fn().mockRejectedValue(new Error('timeout')), exists };

    await expect(deleteAccountAuth('a', deps)).rejects.toThrow('AUTH_EXCLUSAO_NAO_CONFIRMADA');
    await expect(deleteAccountAuth('a', deps)).resolves.toBeUndefined();
    expect(exists).toHaveBeenCalledTimes(2);
  });

  it('does not turn an unavailable administrative query into proof of deletion', async () => {
    await expect(deleteAccountAuth('a', {
      remove: async () => undefined,
      exists: async () => { throw new Error('503'); },
    })).rejects.toThrow('503');
  });
});
