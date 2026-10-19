import { beforeAll, describe, expect, it, vi } from 'vitest';

let createServiceForClient: (client: unknown) => { run(limit: number): Promise<unknown> };

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: () => '' },
    serve: vi.fn(),
  });
  ({ createServiceForClient } = await import('./index.ts') as unknown as {
    createServiceForClient(client: unknown): { run(limit: number): Promise<unknown> };
  });
});

describe('process-account-deletions runtime', () => {
  it('includes actual retention expiry counts in the manual worker response', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { expired: 2, pending: 3 }, error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const service = createServiceForClient({ rpc });

    await expect(service.run(2)).resolves.toEqual({
      claimed: 0, completed: 0, pending: 3, expired: 2,
    });
    expect(rpc.mock.calls).toEqual([
      ['expire_account_deletion_retention', { p_limit: 2 }],
      ['claim_account_deletions', { p_limit: 2 }],
    ]);
  });
});
