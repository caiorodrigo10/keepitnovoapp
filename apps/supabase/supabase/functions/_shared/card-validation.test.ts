import { describe, expect, it } from 'vitest';
import { advanceCardValidation, type CardValidationDeps, type CardValidationOperation } from './card-validation.ts';
import { sandboxCard, sandboxHolder } from './__fixtures__/card.fixtures';

const operationId = 'aaaaaaaa-0000-4000-8000-000000000001';

function setup(overrides: Partial<CardValidationDeps['asaas']> = {}) {
  const events: string[] = [];
  let operation: CardValidationOperation = {
    id: operationId, clienteId: 'cliente-a', ambiente: 'sandbox' as const, valorCentavos: 137,
    estado: 'preparada', customerId: null as string | null, token: null as string | null,
    bandeira: null as string | null, ultimo4: null as string | null, cobrancaId: null as string | null,
    estornoId: null as string | null, estornoConfirmado: false,
  };
  const deps: CardValidationDeps = {
    ambiente: 'sandbox',
    cards: {
      customerStore: {
        async claim() { return { kind: 'ready' as const, customerId: 'cus_cliente_a' }; },
        async getClientIdentity() { return { id: 'cliente-a', nome: 'Cliente', cpf: '12345678901' }; },
        async waitForReady() { return 'cus_cliente_a'; }, async finish() {}, async recover() {}, async reconcile() {},
      },
      async register(input) { events.push('register'); expect(input).toMatchObject({ clienteId: 'cliente-a', operationId, valorCentavos: 137 }); return operation; },
      async claim(_id, stage) { events.push(`claim:${stage}`); return { acquired: true, operation }; },
      async saveToken(_id, token) { events.push('save-token'); operation = { ...operation, estado: 'tokenizado', ...token, customerId: 'cus_cliente_a' }; return operation; },
      async saveCharge(_id, paymentId) { events.push('save-charge'); operation = { ...operation, estado: 'validando', cobrancaId: paymentId }; return operation; },
      async reconcileCharge(_id, paymentId) { events.push('reconcile-charge'); operation = { ...operation, estado: 'validando', cobrancaId: paymentId }; return operation; },
      async saveRefund(_id, refund) { events.push('save-refund'); operation = { ...operation, estado: 'estorno_pendente', estornoId: refund.id, estornoConfirmado: refund.confirmado }; return operation; },
      async confirmRefund() { events.push('confirm-refund'); operation = { ...operation, estornoConfirmado: true }; return operation; },
      async finish(_id) { events.push('finish'); operation = { ...operation, estado: 'concluida', token: null }; return operation; },
      async fail(_id, code) { events.push(`fail:${code}`); operation = { ...operation, estado: code === 'RECUSADA' ? 'recusada' : 'reconciliacao', token: null }; return operation; },
      async get() { return operation; },
    },
    asaas: {
      async criarCliente() { throw new Error('customer already exists'); },
      async listarClientesPorReferencia() { return { ok: true as const, data: { data: [], hasMore: false } }; },
      async tokenizarCartao(input) { events.push('tokenize'); expect(input.customer).toBe('cus_cliente_a'); expect(input.creditCardHolderInfo).toEqual(sandboxHolder); return { ok: true as const, data: { token: 'tok_4242', bandeira: 'VISA', ultimo4: '4242' } }; },
      async criarCobranca(input) { events.push('charge'); expect(input).toMatchObject({ customer: 'cus_cliente_a', value: 1.37, externalReference: `card-validation:${operationId}`, creditCardToken: 'tok_4242' }); return { ok: true as const, data: { id: 'pay_1', status: 'CONFIRMED', value: 1.37, billingType: 'CREDIT_CARD' } }; },
      async consultarCobranca(id) { events.push('check-charge'); expect(id).toBe('pay_1'); return { ok: true as const, data: { id: 'pay_1', status: 'CONFIRMED', value: 1.37, billingType: 'CREDIT_CARD' } }; },
      async listarCobrancasPorReferencia() { return { ok: true as const, data: { data: [], hasMore: false } }; },
      async estornarCobranca(id) { events.push('refund'); expect(id).toBe('pay_1'); return { ok: true as const, data: { id: 'pay_1', refundId: 'refund_1', status: 'REFUNDED', value: 1.37, billingType: 'CREDIT_CARD' } }; },
      ...overrides,
    },
  };
  return { deps, events, operation: () => operation };
}

describe('advanceCardValidation', () => {
  it('persiste cada etapa, estorna integralmente e só então disponibiliza o cartão', async () => {
    const t = setup();
    const result = await advanceCardValidation({ clienteId: 'cliente-a', operationId, cartao: sandboxCard, titular: sandboxHolder, remoteIp: '203.0.113.10', valorCentavos: 137 }, t.deps);

    expect(result).toMatchObject({ estado: 'concluida' });
    expect(t.events).toEqual(['register', 'claim:tokenizar', 'tokenize', 'save-token', 'claim:cobrar', 'charge', 'save-charge', 'claim:estornar', 'refund', 'save-refund', 'claim:finalizar', 'finish']);
    expect(t.operation().token).toBeNull();
  });

  it('não repete POST financeiro quando uma etapa já está em andamento ou a tela fecha', async () => {
    const t = setup();
    const pending = { ...t.operation(), estado: 'validando' as const, cobrancaId: 'pay_1' };
    t.deps.cards.register = async () => { t.events.push('register'); return pending; };
    t.deps.cards.claim = async (_id, stage) => { t.events.push(`claim:${stage}`); return { acquired: false, operation: pending }; };
    await advanceCardValidation({ clienteId: 'cliente-a', operationId, remoteIp: '203.0.113.10', valorCentavos: 137 }, t.deps);
    expect(t.events).toEqual(['register', 'check-charge', 'claim:estornar']);
  });

  it('mantém a operação reconciliável quando tokenização não responde ou o estorno falha', async () => {
    const t = setup({ async tokenizarCartao() { throw new Error('timeout'); } });
    const result = await advanceCardValidation({ clienteId: 'cliente-a', operationId, cartao: sandboxCard, titular: sandboxHolder, remoteIp: '203.0.113.10', valorCentavos: 137 }, t.deps);
    expect(result).toMatchObject({ estado: 'reconciliacao' });
    expect(t.events).toContain('fail:RECONCILIACAO');
  });

  it('retoma sem PAN por consulta e só solicita estorno após a confirmação assíncrona', async () => {
    const t = setup();
    const pending = { ...t.operation(), estado: 'validando' as const, customerId: 'cus_cliente_a', token: 'tok_4242', cobrancaId: 'pay_1' };
    t.deps.cards.register = async () => { t.events.push('register'); return pending; };
    t.deps.cards.claim = async (_id, stage) => { t.events.push(`claim:${stage}`); return { acquired: stage === 'estornar', operation: pending }; };
    t.deps.cards.saveRefund = async () => ({ ...pending, estado: 'estorno_pendente', estornoConfirmado: true });
    t.deps.cards.confirmRefund = async () => ({ ...pending, estado: 'estorno_pendente', estornoConfirmado: true });
    t.deps.cards.finish = async () => ({ ...pending, estado: 'concluida', token: null });
    await advanceCardValidation({ clienteId: 'cliente-a', operationId, remoteIp: '203.0.113.10', valorCentavos: 137 }, t.deps);
    expect(t.events).toEqual(['register', 'check-charge', 'claim:estornar', 'refund', 'claim:finalizar']);
    expect(t.events).not.toContain('tokenize');
    expect(t.events).not.toContain('charge');
  });

  it('usa a operação ativa devolvida pelo repositório, nunca o UUID apresentado depois do registro', async () => {
    const t = setup();
    const active = { ...t.operation(), id: 'aaaaaaaa-0000-4000-8000-000000000099', estado: 'tokenizado' as const, customerId: 'cus_cliente_a', token: 'tok_4242' };
    t.deps.cards.register = async () => active;
    t.deps.cards.claim = async (id, stage) => { t.events.push(`${stage}:${id}`); return { acquired: false, operation: active }; };
    await advanceCardValidation({ clienteId: 'cliente-a', operationId, remoteIp: '203.0.113.10', valorCentavos: 137 }, t.deps);
    expect(t.events).toEqual([`cobrar:${active.id}`]);
  });

  it('trata timeout e rate limit como reconciliação, sem abrir uma nova validação', async () => {
    const t = setup({ async tokenizarCartao() { return { ok: false as const, error: { status: 408, message: 'timeout', cardFailure: { categoria: 'incerto' as const } } }; } });
    expect(await advanceCardValidation({ clienteId: 'cliente-a', operationId, cartao: sandboxCard, titular: sandboxHolder, remoteIp: '203.0.113.10', valorCentavos: 137 }, t.deps)).toMatchObject({ estado: 'reconciliacao' });
    expect(t.events).toContain('fail:RECONCILIACAO');
  });

  it('não promove cartão quando o estorno ainda está pendente ou parcial', async () => {
    const t = setup({ async consultarCobranca() { return { ok: true as const, data: { id: 'pay_1', status: 'PENDING', value: 1.37, billingType: 'CREDIT_CARD' } }; } });
    const pending = { ...t.operation(), estado: 'estorno_pendente' as const, cobrancaId: 'pay_1', estornoId: 'refund_1', estornoConfirmado: false };
    t.deps.cards.register = async () => pending;
    t.deps.cards.claim = async (_id, stage) => { t.events.push(`claim:${stage}`); return { acquired: true, operation: pending }; };
    t.deps.cards.finish = async () => { throw new Error('card must not be promoted'); };
    expect(await advanceCardValidation({ clienteId: 'cliente-a', operationId, remoteIp: '203.0.113.10', valorCentavos: 137 }, t.deps)).toMatchObject({ estado: 'estorno_pendente' });
    expect(t.events).toEqual([]);
  });
});
