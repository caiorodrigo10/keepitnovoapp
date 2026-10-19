import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: vi.fn(),
}));

const request = (body: unknown, headers: Record<string, string> = {}) => new Request('https://edge.invalid/tokenize-card', {
  method: 'POST',
  headers: { authorization: 'Bearer session', ...headers },
  body: JSON.stringify(body),
});

describe('entrypoint tokenize-card', () => {
  let handler: (request: Request) => Promise<Response>;
  let environment: Record<string, string | undefined>;

  beforeEach(() => {
    vi.resetModules();
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'cliente-a' } }, error: null })) } } as never);
    environment = { SUPABASE_URL: 'https://supabase.invalid', SUPABASE_ANON_KEY: 'anon', CARD_VALIDATION_AMOUNT_CENTS: '137' };
    vi.stubGlobal('Deno', { env: { get: (key: string) => environment[key] }, serve: (fn: typeof handler) => { handler = fn; } });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([undefined, '', 'false', '1', 'TRUE', ' true '])('não habilita tokenização com CARD_TOKENIZATION_ENABLED=%j', async (value) => {
    environment.CARD_TOKENIZATION_ENABLED = value;
    await import('./index.ts');
    const response = await handler(request({ acao: 'configuracao' }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'CARD_TOKENIZATION_DISABLED' } });
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('habilita configuração somente com a string true', async () => {
    environment.CARD_TOKENIZATION_ENABLED = 'true';
    await import('./index.ts');
    const response = await handler(request({ acao: 'configuracao' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ disponivel: true, valorCentavos: 137 });
  });
});
