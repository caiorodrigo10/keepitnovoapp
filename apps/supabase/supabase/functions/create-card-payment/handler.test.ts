import { describe, expect, it, vi } from 'vitest';
import { createAsaasClient } from '../_shared/asaas';
import { sandboxCard, sandboxHolder } from '../_shared/__fixtures__/card.fixtures';
import type { DurablePaymentAttempt } from '../_shared/payment-attempt';
import type { PedidosRepo } from '../create-pix-payment/handler';
import { createCardHttpHandler, handleCreateCardPayment, trustedPayerIp } from './handler';

const id = '44444444-0000-4000-8000-000000000001';
const input = { pedido_id: id, operacao_id: id, usuario_id: 'owner', cartao: sandboxCard, titular: sandboxHolder, remoteIp: '203.0.113.10' };
function setup(status: string | number = 'CONFIRMED') {
  let attempt: DurablePaymentAttempt | null = null;
  const payloads: unknown[] = [];
  const writes: unknown[] = [];
  const pedidos: PedidosRepo = {
    getById: async () => ({ id, cliente_id: 'owner', cliente_nome: 'Cliente Sintético', cliente_cpf: sandboxHolder.cpfCnpj, status: 'aguardando_pagamento', forma_pagamento: 'cartao', pago_em: null, total_centavos: 4250, total_pago_reais: 42.5, snapshot_valido: true }),
    claim: async () => {
      if (attempt) return { attempt: { ...attempt }, acquired: false };
      attempt = { id, pedido_id: id, operacao_id: id, forma: 'cartao', estado: 'criando', asaas_payment_id: null, qr_code_pix: null, pix_copia_e_cola: null, expira_em: null, claim_token: 'claim' };
      return { attempt: { ...attempt }, acquired: true };
    },
    save: async (_id, _token, patch) => { writes.push(patch); Object.assign(attempt!, patch); return { ...attempt! }; },
  };
  const fetchImpl: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/customers')) return Response.json({ id: 'cus_sandbox' });
    payloads.push(JSON.parse(init!.body as string));
    if (status === 0) throw new Error(JSON.stringify(sandboxCard));
    return typeof status === 'number' ? Response.json({ errors: [{ description: JSON.stringify(sandboxCard) }] }, { status })
      : Response.json({ id: 'pay_sandbox', status, billingType: 'CREDIT_CARD', value: 42.5, creditCard: sandboxCard });
  };
  const deps = { pedidos, asaasClient: createAsaasClient({ baseUrl: 'https://sandbox.invalid', apiKey: 'test-only', fetchImpl }) };
  return { deps, writes, payloads, attempt: () => attempt, call: () => handleCreateCardPayment(input, deps) };
}
describe('cartão à vista com tentativa durável', () => {
  it('usa total do pedido e mantém pendente até confirmação persistida, sem cartão nos snapshots', async () => {
    const t = setup();
    expect(await t.call()).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
    expect(t.payloads).toEqual([{ customer: 'cus_sandbox', billingType: 'CREDIT_CARD', value: 42.5, dueDate: expect.any(String), externalReference: id, creditCard: sandboxCard, creditCardHolderInfo: sandboxHolder, remoteIp: '203.0.113.10' }]);
    expect(t.attempt()).toMatchObject({ asaas_payment_id: 'pay_sandbox', estado: 'pendente' });
    expect(JSON.stringify(t.writes)).not.toContain(sandboxCard.number);
    expect(JSON.stringify(t.writes)).not.toContain('ccv');
  });
  it('concorrência e replay nunca duplicam cobrança', async () => {
    const t = setup(); await Promise.all([t.call(), t.call()]); await t.call();
    expect(t.payloads).toHaveLength(1);
  });
  it.each([0, 408, 429, 503])('incerteza %s exige conciliação e não recobra', async (status) => {
    const t = setup(status);
    expect(await t.call()).toMatchObject({ ok: false, error: { code: 'PAGAMENTO_RECONCILIACAO' } });
    await t.call(); expect(t.payloads).toHaveLength(1); expect(t.attempt()?.estado).toBe('reconciliacao');
  });
  it.each(['AWAITING_RISK_ANALYSIS', 'PENDING'])('estado %s não confirma', async (status) => {
    expect(await setup(status).call()).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
  });
  it.each([400])('recusa %s é segura e terminal', async (status) => {
    const t = setup(status); const result = await t.call();
    expect(result).toMatchObject({ ok: false, error: { code: 'PAGAMENTO_RECUSADO' } });
    expect(t.attempt()?.estado).toBe('recusado'); expect(JSON.stringify(result)).not.toContain(sandboxCard.number);
  });
  it.each(['CREDIT_CARD_CAPTURE_REFUSED', 'REPROVED_BY_RISK_ANALYSIS'])('recusa %s com cobrança externa preserva ID para conciliação autoritativa', async (status) => {
    const t = setup(status);
    expect(await t.call()).toMatchObject({ ok: false, error: { code: 'PAGAMENTO_RECONCILIACAO' } });
    expect(t.attempt()).toMatchObject({ estado: 'reconciliacao', asaas_payment_id: 'pay_sandbox' });
    expect(t.writes).not.toContainEqual(expect.objectContaining({ estado: 'recusado', asaas_payment_id: 'pay_sandbox' }));
  });
  it('falha de persistência após efeito externo conserva bloqueio', async () => {
    const t = setup(); t.deps.pedidos.save = async () => { throw new Error(JSON.stringify(sandboxCard)); };
    expect(await t.call()).toMatchObject({ ok: false, error: { code: 'PAGAMENTO_RECONCILIACAO' } });
    await t.call(); expect(t.payloads).toHaveLength(1);
  });
  it('pedido de outro usuário é rejeitado antes de reservar ou cobrar', async () => {
    const t = setup(); expect(await handleCreateCardPayment({ ...input, usuario_id: 'intruso' }, t.deps)).toMatchObject({ ok: false, error: { status: 403 } });
    expect(t.attempt()).toBeNull(); expect(t.payloads).toHaveLength(0);
  });
});
describe('fronteira HTTP cartão', () => {
  const request = (extra = {}, token = 'Bearer user') => new Request('https://api.invalid/card', { method: 'POST', headers: { authorization: token }, body: JSON.stringify({ pedido_id: id, operacao_id: id, cartao: sandboxCard, titular: sandboxHolder, ...extra }) });
  it('verifica sessão antes de client privilegiado, sem confiar no usuário do body', async () => {
    const events: string[] = []; const t = setup();
    const handler = createCardHttpHandler({ allowedOrigins: [], authenticate: async () => { events.push('auth'); return 'owner'; }, authorizeOrder: async () => { events.push('authorize'); return true; }, trustedIp: () => '203.0.113.10', createDeps: () => { events.push('admin'); return t.deps; } });
    expect((await handler(request())).status).toBe(200); expect(events).toEqual(['auth', 'authorize', 'admin']);
  });
  it('rejeita token inválido antes da factory', async () => {
    const createDeps = vi.fn(); const handler = createCardHttpHandler({ allowedOrigins: [], authenticate: async () => null, authorizeOrder: async () => true, trustedIp: () => '203.0.113.10', createDeps });
    expect((await handler(request())).status).toBe(401); expect(createDeps).not.toHaveBeenCalled();
  });
  it.each([{ installmentCount: 2 }, { installmentValue: 10 }, { totalValue: 1 }, { remoteIp: '1.1.1.1' }, { usuario_id: 'intruso' }, { cartao: { ...sandboxCard, installmentCount: 2 } }])('rejeita campos extras %j antes do gateway', async (extra) => {
    const createDeps = vi.fn(); const handler = createCardHttpHandler({ allowedOrigins: [], authenticate: async () => 'owner', authorizeOrder: async () => true, trustedIp: () => '203.0.113.10', createDeps });
    expect((await handler(request(extra))).status).toBe(400); expect(createDeps).not.toHaveBeenCalled();
  });
  it('sem IP confiável falha fechado sem cobrar', async () => {
    const createDeps = vi.fn(); const handler = createCardHttpHandler({ allowedOrigins: [], authenticate: async () => 'owner', authorizeOrder: async () => true, trustedIp: () => null, createDeps });
    expect((await handler(request())).status).toBe(503); expect(createDeps).not.toHaveBeenCalled();
  });
  it('só aceita IP injetado por proxy autenticado; headers comuns não bastam', () => {
    const req = (headers: Record<string, string>) => new Request('https://api.invalid', { headers });
    expect(trustedPayerIp(req({ 'x-forwarded-for': '203.0.113.10' }), 'server-secret')).toBeNull();
    expect(trustedPayerIp(req({ 'x-payment-proxy-token': 'wrong', 'x-payment-client-ip': '203.0.113.10' }), 'server-secret')).toBeNull();
    expect(trustedPayerIp(req({ 'x-payment-proxy-token': 'server-secret', 'x-payment-client-ip': '203.0.113.10' }), 'server-secret')).toBe('203.0.113.10');
    expect(trustedPayerIp(req({ 'x-payment-proxy-token': 'server-secret', 'x-payment-client-ip': 'spoof, 203.0.113.10' }), 'server-secret')).toBeNull();
  });
});
