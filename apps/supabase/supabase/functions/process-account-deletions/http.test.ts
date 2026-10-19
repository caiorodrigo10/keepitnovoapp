import { describe, expect, it, vi } from 'vitest';

import { handleDeletionWorker } from './http.ts';

const result = { claimed: 2, completed: 1, pending: 3, expired: 0 };

describe('handleDeletionWorker', () => {
  it('rejects an unauthorized request before constructing a privileged service', async () => {
    const createService = vi.fn();

    const response = await handleDeletionWorker(new Request('http://local', { method: 'POST', body: '{}' }), {
      enabled: true, authorized: () => false, createService,
    });

    expect(response.status).toBe(401);
    expect(createService).not.toHaveBeenCalled();
  });

  it('does not claim work while the internal runtime is disabled', async () => {
    const run = vi.fn(async () => result);
    const createService = vi.fn(() => ({ run }));

    const response = await handleDeletionWorker(new Request('http://local', { method: 'POST', body: '{}' }), {
      enabled: false, authorized: () => true, createService,
    });

    expect(response.status).toBe(503);
    expect(createService).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('accepts only a strict bounded body and exposes aggregate counts', async () => {
    const run = vi.fn(async () => result);
    const createService = vi.fn(() => ({ run }));

    const response = await handleDeletionWorker(new Request('http://local', { method: 'POST', body: '{"limit":2}' }), {
      enabled: true, authorized: () => true, createService,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(run).toHaveBeenCalledWith(2);

    const invalid = await handleDeletionWorker(new Request('http://local', { method: 'POST', body: '{"limit":2,"userId":"x"}' }), {
      enabled: true, authorized: () => true, createService,
    });
    expect(invalid.status).toBe(400);
    expect(createService).toHaveBeenCalledTimes(1);
  });
});
