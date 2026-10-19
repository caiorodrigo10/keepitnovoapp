import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const entrypoint = vi.hoisted(() => ({ handler: vi.fn(async () => new Response('{}')), factory: vi.fn() }));

vi.mock('./handler.ts', () => ({
  createReconcileCardValidationHttpHandler: entrypoint.factory.mockImplementation((deps) => {
    entrypoint.handler.mockName('reconcile-card-validation runtime handler');
    return entrypoint.handler.mockImplementation(async () => new Response(JSON.stringify({ enabled: deps.enabled })));
  }),
}));

describe('reconcile-card-validation entrypoint', () => {
  let environment: Record<string, string | undefined>;
  let served: (request: Request) => Promise<Response>;

  beforeEach(() => {
    vi.resetModules();
    entrypoint.factory.mockClear();
    environment = {};
    vi.stubGlobal('Deno', {
      env: { get: (key: string) => environment[key] },
      serve: (handler: typeof served) => { served = handler; },
    });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([undefined, '', 'false', '1', 'TRUE', ' true '])('mantém a reconciliação desabilitada com CARD_TOKENIZATION_ENABLED=%j', async (value) => {
    environment.CARD_TOKENIZATION_ENABLED = value;
    await import('./index.ts');
    expect(entrypoint.factory).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(await served(new Request('https://edge.invalid'))).toHaveProperty('status', 200);
  });

  it('habilita a reconciliação somente com a string true', async () => {
    environment.CARD_TOKENIZATION_ENABLED = 'true';
    await import('./index.ts');
    expect(entrypoint.factory).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });
});
