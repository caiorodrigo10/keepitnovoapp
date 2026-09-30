import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { sandboxCard, sandboxHolder } from '../_shared/__fixtures__/card.fixtures';

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return { ...actual, createClient: vi.fn(actual.createClient) };
});

const pedidoId = '44444444-0000-4000-8000-000000000001';
const ownerId = '44444444-0000-4000-8000-000000000002';
const payable = { id: pedidoId, cliente_id: ownerId, status: 'aguardando_pagamento', forma_pagamento: 'cartao', pago_em: null, cotacao_id: pedidoId };

describe('autorização do pedido antes do client privilegiado no entrypoint', () => {
  let handler: (req: Request) => Promise<Response>;
  let row: Record<string, unknown> | null;
  let queryError: boolean;
  let validToken: boolean;
  let events: string[];
  let queries: URL[];
  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(createClient).mockClear();
    row = { ...payable };
    queryError = false;
    validToken = true;
    events = [];
    queries = [];
    const env: Record<string, string> = {
      SUPABASE_URL: 'https://supabase.invalid', SUPABASE_ANON_KEY: 'anon-test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test', PAYMENT_PROXY_SECRET: 'proxy-test',
      ASAAS_API_KEY: 'asaas-test', ASAAS_BASE_URL: 'https://sandbox.invalid',
    };
    vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] }, serve: (fn: typeof handler) => { handler = fn; } });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.pathname === '/auth/v1/user') {
        events.push('authenticate');
        return validToken ? Response.json({ id: ownerId }) : Response.json({ message: 'invalid token' }, { status: 401 });
      }
      if (url.pathname === '/rest/v1/pedidos') {
        events.push('authorize');
        queries.push(url);
        expect(request.headers.get('authorization')).toBe('Bearer user-test');
        expect(request.headers.get('apikey')).toBe('anon-test');
        if (queryError) return Response.json({ message: 'query denied' }, { status: 403 });
        const matches = row && [...url.searchParams].every(([key, filter]) => {
          if (key === 'select') return true;
          if (filter === 'is.null') return row![key] === null;
          if (filter === 'not.is.null') return row![key] !== null;
          return filter === `eq.${row![key]}`;
        });
        return Response.json(matches ? [{ id: pedidoId }] : []);
      }
      if (url.pathname === '/rest/v1/rpc/obter_pedido_pagamento') {
        events.push('admin-read');
        // A projeção defensiva ainda pode rejeitar uma mudança posterior à autorização.
        return Response.json(null);
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
    await import('./index');
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  const request = () => new Request('https://api.invalid/card', {
    method: 'POST', headers: { authorization: 'Bearer user-test', 'x-payment-proxy-token': 'proxy-test', 'x-payment-client-ip': '203.0.113.10' },
    body: JSON.stringify({ pedido_id: pedidoId, operacao_id: pedidoId, cartao: sandboxCard, titular: sandboxHolder }),
  });
  const adminCreated = () => vi.mocked(createClient).mock.calls.some((call) => call[1] === 'service-role-test');

  it('autoriza sob a sessão com projeção mínima antes de criar admin e preserva a validação posterior', async () => {
    expect((await handler(request())).status).toBe(404);
    expect(events).toEqual(['authenticate', 'authorize', 'admin-read']);
    expect(Object.fromEntries(queries[0].searchParams)).toEqual({
      select: 'id', id: `eq.${pedidoId}`, cliente_id: `eq.${ownerId}`,
      status: 'eq.aguardando_pagamento', forma_pagamento: 'eq.cartao', pago_em: 'is.null', cotacao_id: 'not.is.null',
    });
    expect(adminCreated()).toBe(true);
  });
  it.each([
    ['outro proprietário', { cliente_id: 'outro-usuario' }],
    ['já processado', { status: 'aguardando_aceite' }],
    ['outra forma', { forma_pagamento: 'pix' }],
    ['pago', { pago_em: '2026-09-30T00:00:00Z' }],
    ['sem cotação', { cotacao_id: null }],
  ])('pedido %s não instancia nem consulta admin', async (_label, patch) => {
    row = { ...payable, ...patch };
    expect((await handler(request())).status).toBe(403);
    expect(events).toEqual(['authenticate', 'authorize']);
    expect(adminCreated()).toBe(false);
  });
  it('pedido inexistente não instancia admin', async () => {
    row = null;
    expect((await handler(request())).status).toBe(403);
    expect(adminCreated()).toBe(false);
  });
  it('falha da consulta autenticada não instancia admin', async () => {
    queryError = true;
    expect((await handler(request())).status).toBe(503);
    expect(adminCreated()).toBe(false);
  });
  it('token inválido não consulta pedido nem instancia admin', async () => {
    validToken = false;
    expect((await handler(request())).status).toBe(401);
    expect(events).toEqual(['authenticate']);
    expect(adminCreated()).toBe(false);
  });
});
