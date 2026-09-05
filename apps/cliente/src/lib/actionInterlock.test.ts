import { describe, expect, it, vi } from 'vitest';

import { createActionInterlock } from './actionInterlock';

describe('actionInterlock', () => {
  it('permite uma única mutação e navegação durante persistência pendente', async () => {
    let releasePersist!: () => void;
    const persist = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releasePersist = resolve;
        }),
    );
    const navigate = vi.fn();
    const interlock = createActionInterlock();

    const runIntent = async () => {
      if (!interlock.acquire()) {
        return;
      }
      try {
        await persist();
        navigate();
      } finally {
        interlock.release();
      }
    };

    const first = runIntent();
    const repeated = runIntent();
    await Promise.resolve();

    expect(persist).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();

    releasePersist();
    await Promise.all([first, repeated]);

    expect(persist).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
  });
});
