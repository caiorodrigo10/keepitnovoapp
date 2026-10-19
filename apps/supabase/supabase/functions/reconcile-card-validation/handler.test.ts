import { describe, expect, it, vi } from 'vitest';

import { createReconcileCardValidationHttpHandler, handleReconcileCardValidation } from './handler.ts';

const operationId = 'bbbbbbbb-0000-4000-8000-000000000001';
const request = (body: unknown, headers: Record<string, string> = {}) => new Request(
  'https://edge.invalid/reconcile-card-validation',
  { method: 'POST', headers: { authorization: 'Bearer session', ...headers }, body: JSON.stringify(body) },
);

describe('reconcile-card-validation boundary', () => {
  it('bloqueia admin autorizado por padrão antes do serviço', async () => {
    const createDeps = vi.fn();
    const handler = createReconcileCardValidationHttpHandler({
      authenticateAdmin: async () => ({ authenticated: true, adminId: 'admin-1' }),
      createDeps,
    });

    const response = await handler(request({ operacaoId: operationId }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'CARD_TOKENIZATION_DISABLED' } });
    expect(createDeps).not.toHaveBeenCalled();
  });

  it('authenticates and authorizes an Admin before constructing privileged dependencies', async () => {
    const createDeps = vi.fn(() => ({
      cards: { get: async () => ({ id: operationId, clienteId: 'cliente-1', valorCentavos: 137, estado: 'concluida' }) },
      asaas: {},
    }));
    const deps = createDeps() as never;
    expect(await handleReconcileCardValidation({ operacaoId: operationId }, deps)).toMatchObject({ status: 200 });
    const handler = createReconcileCardValidationHttpHandler({
      enabled: true,
      authenticateAdmin: async () => ({ authenticated: true, adminId: 'admin-1' }),
      createDeps: () => deps,
    });

    const response = await handler(request({ operacaoId: operationId }));

    expect(response.status).toBe(200);
    expect(createDeps).toHaveBeenCalledOnce();
  });

  it('does not construct privileged dependencies for a non-Admin caller', async () => {
    const createDeps = vi.fn();
    const handler = createReconcileCardValidationHttpHandler({
      authenticateAdmin: async () => ({ authenticated: true, adminId: null }),
      createDeps,
    });

    expect((await handler(request({ operacaoId: operationId }))).status).toBe(403);
    expect(createDeps).not.toHaveBeenCalled();
  });

  it('preserva OPTIONS e erros de segurança e entrada com a flag desligada', async () => {
    const createDeps = vi.fn();
    const handler = createReconcileCardValidationHttpHandler({
      authenticateAdmin: async () => ({ authenticated: false, adminId: null }),
      createDeps,
    });
    expect((await handler(new Request('https://edge.invalid', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await handler(request({ operacaoId: operationId }))).status).toBe(401);
    expect(createDeps).not.toHaveBeenCalled();

    const nonAdmin = createReconcileCardValidationHttpHandler({
      authenticateAdmin: async () => ({ authenticated: true, adminId: null }),
      createDeps,
    });
    expect((await nonAdmin(request({ operacaoId: operationId }))).status).toBe(403);

    const invalid = createReconcileCardValidationHttpHandler({
      authenticateAdmin: async () => ({ authenticated: true, adminId: 'admin-1' }),
      createDeps,
    });
    expect((await invalid(request({ operacaoId: 'invalid' }))).status).toBe(400);
    expect(createDeps).not.toHaveBeenCalled();
  });
});
