import { describe, expect, it, vi } from 'vitest';

import { createReconcileHttpHandler, handleReconcilePayment } from './handler';
import type { ReconcileDeps } from './handler';
import type { PaymentEventInput } from '../asaas-payment-webhook/handler';

const attempt = {
  id: '11111111-1111-4111-8111-111111111111',
  paymentId: 'pay-1',
};
const payment = {
  id: 'pay-1', status: 'RECEIVED', value: 107.9, billingType: 'CREDIT_CARD',
  externalReference: attempt.id,
};

function dependencies(overrides: Partial<ReconcileDeps> = {}) {
  const getAttempt = vi.fn(async () => attempt);
  const bindPaymentId = vi.fn(async () => ({ bound: true as const }));
  const getPayment = vi.fn(async () => ({ ok: true as const, data: payment }));
  const listPayments = vi.fn(async () => ({ ok: true as const, data: { data: [payment], hasMore: false } }));
  const processPaymentEvent = vi.fn(async () => ({ resultado: 'recebido', pedidoId: 'pedido-1' }));
  const markCardNotSaved = vi.fn(async () => undefined);
  const value: ReconcileDeps = {
    attempts: { getById: getAttempt, bindPaymentId },
    gateway: { getPayment, listPayments },
    events: { processPaymentEvent },
    cardSave: { markNotSaved: markCardNotSaved },
    ...overrides,
  };
  return { value, getAttempt, bindPaymentId, getPayment, listPayments, processPaymentEvent, markCardNotSaved };
}

describe('handleReconcilePayment', () => {
  it('consulta pelo ID externo persistido e processa o estado sem criar cobrança', async () => {
    const deps = dependencies();
    const result = await handleReconcilePayment({ attemptId: attempt.id }, deps.value);
    expect(result).toEqual({ status: 200, body: { ok: true, resultado: 'recebido', pedido_id: 'pedido-1' } });
    expect(deps.getPayment).toHaveBeenCalledWith('pay-1');
    expect(deps.listPayments).not.toHaveBeenCalled();
    expect(deps.processPaymentEvent).toHaveBeenCalledWith({
      eventId: `reconcile:${attempt.id}:pay-1:RECEIVED`, event: 'PAYMENT_RECEIVED',
      paymentId: 'pay-1', reference: attempt.id, valueCents: 10_790, method: 'cartao',
    });
  });

  it('concilia resposta perdida sem token com aviso, sem uma segunda cobrança', async () => {
    const deps = dependencies();

    await handleReconcilePayment({ attemptId: attempt.id }, deps.value);

    expect(deps.markCardNotSaved).toHaveBeenCalledOnce();
    expect(deps.markCardNotSaved).toHaveBeenCalledWith(attempt.id);
    expect(deps.getPayment).toHaveBeenCalledOnce();
    expect(deps.listPayments).not.toHaveBeenCalled();
  });

  it('não fecha o salvamento se o evento conciliado divergir do pagamento', async () => {
    const deps = dependencies({
      events: { processPaymentEvent: vi.fn(async () => ({ resultado: 'valor_divergente', pedidoId: 'pedido-1' })) },
    });

    await handleReconcilePayment({ attemptId: attempt.id }, deps.value);

    expect(deps.markCardNotSaved).not.toHaveBeenCalled();
  });

  it('sem ID externo busca somente pela referência persistida da tentativa', async () => {
    const bindPaymentId = vi.fn(async () => ({ bound: true as const }));
    const deps = dependencies({
      attempts: { getById: vi.fn(async () => ({ ...attempt, paymentId: null })), bindPaymentId },
    });
    await handleReconcilePayment({ attemptId: attempt.id }, deps.value);
    expect(deps.listPayments).toHaveBeenCalledWith(attempt.id);
    expect(deps.getPayment).not.toHaveBeenCalled();
    expect(bindPaymentId).toHaveBeenCalledWith(attempt.id, 'pay-1');
    expect(deps.processPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay-1' }));
  });

  it('mantém conflito explícito se o ID encontrado por referência não puder ser vinculado', async () => {
    const deps = dependencies({
      attempts: {
        getById: vi.fn(async () => ({ ...attempt, paymentId: null })),
        bindPaymentId: vi.fn(async () => ({ bound: false as const })),
      },
    });
    const result = await handleReconcilePayment({ attemptId: attempt.id }, deps.value);
    expect(result).toMatchObject({ status: 409, body: { error: { code: 'VINCULO_DIVERGENTE' } } });
    expect(deps.processPaymentEvent).not.toHaveBeenCalled();
  });

  it('rejeita resultado cujo externalReference não seja a tentativa consultada', async () => {
    const bindPaymentId = vi.fn(async () => ({ bound: true as const }));
    const deps = dependencies({
      attempts: { getById: vi.fn(async () => ({ ...attempt, paymentId: null })), bindPaymentId },
      gateway: {
        getPayment: vi.fn(),
        listPayments: vi.fn(async () => ({
          ok: true,
          data: { data: [{ ...payment, externalReference: 'outra-tentativa' }], hasMore: false },
        })),
      },
    } as Partial<ReconcileDeps>);
    const result = await handleReconcilePayment({ attemptId: attempt.id }, deps.value);
    expect(result).toMatchObject({ status: 409, body: { error: { code: 'VINCULO_DIVERGENTE' } } });
    expect(bindPaymentId).not.toHaveBeenCalled();
    expect(deps.processPaymentEvent).not.toHaveBeenCalled();
  });

  it('não tenta vincular cobrança por referência quando o gateway omite o ID', async () => {
    const bindPaymentId = vi.fn(async () => ({ bound: true as const }));
    const deps = dependencies({
      attempts: { getById: vi.fn(async () => ({ ...attempt, paymentId: null })), bindPaymentId },
      gateway: {
        getPayment: vi.fn(),
        listPayments: vi.fn(async () => ({
          ok: true,
          data: { data: [{ ...payment, id: undefined }], hasMore: false },
        })) as unknown as ReconcileDeps['gateway']['listPayments'],
      },
    } as Partial<ReconcileDeps>);
    const result = await handleReconcilePayment({ attemptId: attempt.id }, deps.value);
    expect(result).toMatchObject({ status: 503, body: { error: { code: 'RECONCILIACAO_INCONCLUSA' } } });
    expect(bindPaymentId).not.toHaveBeenCalled();
    expect(deps.processPaymentEvent).not.toHaveBeenCalled();
  });

  it.each([
    [[], 'COBRANCA_NAO_LOCALIZADA'],
    [[payment, { ...payment, id: 'pay-2' }], 'COBRANCA_AMBIGUA'],
  ])('mantém ausência/ambiguidade explícita para %j', async (payments, code) => {
    const deps = dependencies({
      attempts: {
        getById: vi.fn(async () => ({ ...attempt, paymentId: null })),
        bindPaymentId: vi.fn(async () => ({ bound: true })),
      },
      gateway: {
        getPayment: vi.fn(),
        listPayments: vi.fn(async () => ({ ok: true, data: { data: payments, hasMore: false } })),
      },
    } as Partial<ReconcileDeps>);
    const result = await handleReconcilePayment({ attemptId: attempt.id }, deps.value);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ ok: false, error: { code } });
    expect(deps.processPaymentEvent).not.toHaveBeenCalled();
  });

  it('mantém timeout do gateway explícito e redigido', async () => {
    const deps = dependencies({
      gateway: {
        getPayment: vi.fn(async () => ({ ok: false, error: { status: 0, message: 'socket token=secreto' } })),
        listPayments: vi.fn(),
      },
    } as Partial<ReconcileDeps>);
    const result = await handleReconcilePayment({ attemptId: attempt.id }, deps.value);
    expect(result).toEqual({
      status: 503,
      body: { ok: false, error: { code: 'RECONCILIACAO_INCONCLUSA', message: 'Não foi possível confirmar o estado no gateway.' } },
    });
    expect(JSON.stringify(result)).not.toContain('secreto');
  });

  it('não promove análise de risco para pagamento confirmado', async () => {
    const deps = dependencies({
      gateway: {
        getPayment: vi.fn(async () => ({ ok: true, data: { ...payment, status: 'AWAITING_RISK_ANALYSIS' } })),
        listPayments: vi.fn(),
      },
    } as Partial<ReconcileDeps>);
    await handleReconcilePayment({ attemptId: attempt.id }, deps.value);
    expect(deps.processPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'PAYMENT_AWAITING_RISK_ANALYSIS' }));
  });

  it('mantém cobrança PENDING como tentativa pendente, sem evento desconhecido', async () => {
    const processPending = vi.fn(async () => ({ resultado: 'pendente', pedidoId: 'pedido-1' }));
    const deps = dependencies({
      gateway: {
        getPayment: vi.fn(async () => ({ ok: true, data: { ...payment, status: 'PENDING' } })),
        listPayments: vi.fn(),
      },
      events: { processPaymentEvent: processPending },
    } as Partial<ReconcileDeps>);
    await handleReconcilePayment({ attemptId: attempt.id }, deps.value);
    expect(processPending).toHaveBeenCalledWith(expect.objectContaining({ event: 'PAYMENT_UPDATED' }));
    expect(deps.markCardNotSaved).not.toHaveBeenCalled();
  });

  it('chamadas concorrentes usam a mesma identidade e produzem um único efeito persistido', async () => {
    const efeitos = new Map<string, { resultado: string; pedidoId: string | null }>();
    const processPaymentEvent = vi.fn(async (input: PaymentEventInput) => {
      const persisted = efeitos.get(input.eventId) ?? { resultado: 'recebido', pedidoId: 'pedido-1' };
      efeitos.set(input.eventId, persisted);
      return persisted;
    });
    const deps = dependencies({ events: { processPaymentEvent } });

    const results = await Promise.all([
      handleReconcilePayment({ attemptId: attempt.id }, deps.value),
      handleReconcilePayment({ attemptId: attempt.id }, deps.value),
    ]);

    expect(results).toEqual([
      { status: 200, body: { ok: true, resultado: 'recebido', pedido_id: 'pedido-1' } },
      { status: 200, body: { ok: true, resultado: 'recebido', pedido_id: 'pedido-1' } },
    ]);
    expect(efeitos.size).toBe(1);
    expect([...efeitos.keys()]).toEqual([`reconcile:${attempt.id}:pay-1:RECEIVED`]);
  });

  it('retry após resposta perdida reutiliza a identidade e relê o mesmo desfecho', async () => {
    const efeitos = new Map<string, { resultado: string; pedidoId: string | null }>();
    const processPaymentEvent = vi.fn(async (input: PaymentEventInput) => {
      const persisted = efeitos.get(input.eventId) ?? { resultado: 'recebido', pedidoId: 'pedido-1' };
      efeitos.set(input.eventId, persisted);
      return persisted;
    });
    const deps = dependencies({ events: { processPaymentEvent } });

    await handleReconcilePayment({ attemptId: attempt.id }, deps.value); // resposta não chegou ao operador
    const retry = await handleReconcilePayment({ attemptId: attempt.id }, deps.value);

    expect(retry).toEqual({ status: 200, body: { ok: true, resultado: 'recebido', pedido_id: 'pedido-1' } });
    expect(efeitos.size).toBe(1);
  });
});

describe('createReconcileHttpHandler', () => {
  it('responde ao preflight sem autenticar nem construir dependências', async () => {
    const createDeps = vi.fn(() => dependencies().value);
    const authenticateAdmin = vi.fn();
    const handler = createReconcileHttpHandler({ authenticateAdmin, createDeps });
    const response = await handler(new Request('https://example.test', { method: 'OPTIONS' }));

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-headers')).toContain('apikey');
    expect(response.headers.get('access-control-allow-headers')).toContain('x-client-info');
    expect(authenticateAdmin).not.toHaveBeenCalled();
    expect(createDeps).not.toHaveBeenCalled();
  });

  it.each([
    [null, 401],
    ['Bearer token-cliente', 403],
  ])('nega %s antes de construir dependências privilegiadas', async (authorization, expectedStatus) => {
    const createDeps = vi.fn(() => dependencies().value);
    const authenticateAdmin = vi.fn(async (token: string) => token === 'token-cliente'
      ? { authenticated: true, adminId: null }
      : { authenticated: false, adminId: null });
    const handler = createReconcileHttpHandler({ authenticateAdmin, createDeps });
    const response = await handler(new Request('https://example.test', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
      body: JSON.stringify({ tentativaId: attempt.id }),
    }));
    expect(response.status).toBe(expectedStatus);
    expect(createDeps).not.toHaveBeenCalled();
  });

  it('Admin autenticado pode reconciliar uma tentativa', async () => {
    const deps = dependencies();
    const handler = createReconcileHttpHandler({
      authenticateAdmin: vi.fn(async () => ({ authenticated: true, adminId: 'admin-1' })),
      createDeps: vi.fn(() => deps.value),
    });
    const response = await handler(new Request('https://example.test', {
      method: 'POST', headers: { authorization: 'Bearer token-admin' },
      body: JSON.stringify({ tentativaId: attempt.id }),
    }));
    expect(response.status).toBe(200);
    expect(deps.processPaymentEvent).toHaveBeenCalledOnce();
  });
});
