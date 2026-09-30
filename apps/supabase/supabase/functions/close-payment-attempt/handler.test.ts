import { describe, expect, it } from 'vitest';
import { createAsaasClient, type AsaasPayment } from '../_shared/asaas';
import { handleClosePaymentAttempt, createClosePaymentHttpHandler, type ClosePaymentRepo, type ClosureClaim } from './handler';

const input = { tentativa_id: 'tentativa-1', operacao_id: 'encerrar-1', usuario_id: 'cliente-1' };
const payment: AsaasPayment = { id: 'pay_1', status: 'PENDING', value: 42.5, billingType: 'PIX', externalReference: input.tentativa_id, deleted: false };
function setup(options: { failDelete?: number | 'timeout'; failLookup?: number | 'timeout'; persistFails?: boolean; paidAfterDelete?: boolean; payment?: Partial<AsaasPayment>; missingId?: boolean; emptyList?: boolean; listHasMore?: boolean } = {}) {
  let gateway = { ...payment, ...options.payment };
  const requests: string[] = [];
  let locked = false;
  let failPersistence = options.persistFails ?? false;
  const attempt: ClosureClaim['attempt'] = { id: input.tentativa_id, pedido_id: 'pedido-1', cliente_id: input.usuario_id, operacao_id: 'criar-1', forma: 'pix' as const,
    estado: 'pendente' as const, asaas_payment_id: options.missingId ? null : 'pay_1', qr_code_pix: null, pix_copia_e_cola: null, expira_em: null, claim_token: 'create-token' };
  const claim: ClosureClaim = { attempt, total_centavos: 4250, acquired: true, claim_token: 'close-token' };
  const repo: ClosePaymentRepo = {
    prepare: async (_id, _op, userId) => {
      if (userId !== attempt.cliente_id) throw new Error('ACESSO_NEGADO');
      if (claim.attempt.estado === 'expirado') return { ...claim, acquired: false };
      if (locked) return { ...claim, acquired: false };
      locked = true; claim.attempt.estado = 'reconciliacao'; return claim;
    },
    complete: async (_id, _token, proof) => {
      if (failPersistence) throw new Error('db unavailable');
      expect(proof).toMatchObject({ id: 'pay_1', deleted: true, externalReference: input.tentativa_id, status: 'PENDING', value: 42.5 });
      claim.attempt.estado = 'expirado'; locked = false; return { id: attempt.id, pedidoId: attempt.pedido_id, estado: 'expirado' };
    },
    uncertain: async () => { claim.attempt.estado = 'reconciliacao'; locked = false; },
  };
  const asaasClient = createAsaasClient({ baseUrl: 'https://asaas.invalid/v3', apiKey: 'fake-server-key', fetchImpl: async (url, init) => {
    const path = String(url).replace('https://asaas.invalid/v3', ''); const method = init?.method ?? 'GET'; requests.push(`${method} ${path}`);
    if (method === 'DELETE') {
      if (options.failDelete === 'timeout') throw new Error('timeout');
      if (options.failDelete) return Response.json({ errors: [{ description: 'gateway fail' }] }, { status: options.failDelete });
      gateway = { ...gateway, deleted: true, ...(options.paidAfterDelete ? { status: 'RECEIVED', paymentDate: '2026-09-30' } : {}) };
      return Response.json({ id: 'pay_1', deleted: true });
    }
    if (options.failLookup === 'timeout') throw new Error('lookup timeout');
    if (options.failLookup) return Response.json({}, { status: options.failLookup });
    if (path.startsWith('/payments?')) return Response.json({ data: options.emptyList ? [] : [gateway], hasMore: options.listHasMore ?? false });
    return Response.json(gateway);
  } });
  return { claim, requests, repo, asaasClient, resumeDb: () => { failPersistence = false; }, call: () => handleClosePaymentAttempt(input, { repo, asaasClient }) };
}
describe('encerramento real de tentativa', () => {
  it('consulta, exclui e confirma novamente no gateway antes de liberar troca', async () => {
    const t = setup();
    expect(await t.call()).toMatchObject({ ok: true, data: { estado: 'expirado' } });
    expect(t.requests).toEqual(['GET /payments/pay_1', 'DELETE /payments/pay_1', 'GET /payments/pay_1']);
    expect(t.claim.attempt.estado).toBe('expirado');
    expect((await t.call()).ok).toBe(true);
    expect(t.requests).toHaveLength(3);
  });
  it.each([400, 408, 429, 500, 'timeout'] as const)('falha %s ao encerrar mantém tentativa bloqueada', async (failDelete) => {
    const t = setup({ failDelete });
    expect(await t.call()).toMatchObject({ ok: false, error: { code: 'PAGAMENTO_RECONCILIACAO' } });
    expect(t.claim.attempt.estado).toBe('reconciliacao');
    expect(t.requests.filter((r) => r.startsWith('DELETE'))).toHaveLength(1);
  });
  it.each([404, 503, 'timeout'] as const)('consulta inconclusiva %s não exclui e mantém bloqueio', async (failLookup) => {
    const t = setup({ failLookup });
    expect((await t.call()).ok).toBe(false);
    expect(t.claim.attempt.estado).toBe('reconciliacao');
    expect(t.requests.some((r) => r.startsWith('DELETE'))).toBe(false);
  });
  it('timeout após efeito externo é recuperado por consulta sem segunda exclusão', async () => {
    const t = setup({ persistFails: true });
    expect((await t.call()).ok).toBe(false);
    expect(t.claim.attempt.estado).toBe('reconciliacao');
    t.resumeDb();
    expect((await t.call()).ok).toBe(true);
    expect(t.requests.filter((r) => r.startsWith('DELETE'))).toHaveLength(1);
  });
  it('cobrança incerta sem ID é localizada pela referência durável', async () => {
    const t = setup({ missingId: true });
    expect((await t.call()).ok).toBe(true);
    expect(t.requests[0]).toBe('GET /payments?externalReference=tentativa-1&limit=2');
  });
  it.each([{ emptyList: true }, { listHasMore: true }])('resultado ausente/ambíguo não libera outra cobrança %j', async (options) => {
    const t = setup({ missingId: true, ...options });
    expect((await t.call()).ok).toBe(false);
    expect(t.claim.attempt.estado).toBe('reconciliacao');
    expect(t.requests.some((r) => r.startsWith('DELETE'))).toBe(false);
  });
  it.each([{ status: 'CONFIRMED' }, { status: 'RECEIVED' }, { value: 0.01 }, { billingType: 'CREDIT_CARD' }, { externalReference: 'outro' }])('estado/vínculo financeiro incompatível não é excluído %j', async (patch) => {
    const t = setup({ payment: patch });
    expect((await t.call()).ok).toBe(false);
    expect(t.requests.some((r) => r.startsWith('DELETE'))).toBe(false);
    expect(t.claim.attempt.estado).toBe('reconciliacao');
  });
  it('pagamento que muda durante exclusão não libera troca', async () => {
    const t = setup({ paidAfterDelete: true });
    expect((await t.call()).ok).toBe(false);
    expect(t.claim.attempt.estado).toBe('reconciliacao');
  });
  it('claim exclusivo permite somente um encerramento concorrente', async () => {
    const t = setup(); const results = await Promise.all([t.call(), t.call()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(t.requests.filter((r) => r.startsWith('DELETE'))).toHaveLength(1);
  });
  it('outro usuário não consulta nem exclui no gateway', async () => {
    const t = setup();
    expect((await handleClosePaymentAttempt({ ...input, usuario_id: 'outro' }, { repo: t.repo, asaasClient: t.asaasClient })).ok).toBe(false);
    expect(t.requests).toHaveLength(0);
  });
});

it('HTTP de encerramento valida sessão antes da dependência privilegiada', async () => {
  const events: string[] = [];
  const t = setup();
  const http = createClosePaymentHttpHandler({ allowedOrigins: ['https://cliente.example'],
    authenticate: async () => { events.push('auth'); return null; },
    createDeps: () => { events.push('privileged'); return { repo: t.repo, asaasClient: t.asaasClient }; },
  });
  const req = new Request('https://api.example/close', { method: 'POST', headers: { Authorization: 'Bearer invalid', Origin: 'https://cliente.example' },
    body: JSON.stringify({ tentativa_id: '44444444-0000-4000-8000-000000000001', operacao_id: '44444444-0000-4000-8000-000000000002' }) });
  expect((await http(req)).status).toBe(401);
  expect(events).toEqual(['auth']);
  expect(t.requests).toHaveLength(0);
});
