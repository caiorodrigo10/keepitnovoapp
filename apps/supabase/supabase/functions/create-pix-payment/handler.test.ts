import { describe, expect, it, vi } from 'vitest';
import type { AsaasClient } from '../_shared/asaas';
import type { DurablePaymentAttempt } from '../_shared/payment-attempt';
import { handleCreatePixPayment, createPixHttpHandler } from './handler';
import type { PedidoParaCobranca, PedidosRepo } from './handler';

const pedido: PedidoParaCobranca = {
  id: 'pedido-1', cliente_id: 'cliente-1', cliente_nome: 'Maria', cliente_cpf: '24971563792',
  status: 'aguardando_pagamento', forma_pagamento: 'pix', pago_em: null,
  total_centavos: 4250, total_pago_reais: 42.5, snapshot_valido: true,
};
const input = { pedido_id: pedido.id, operacao_id: 'op-1', usuario_id: pedido.cliente_id };
function setup(overrides: Partial<PedidoParaCobranca> = {}) {
  let attempt: DurablePaymentAttempt | null = null;
  const events: string[] = [];
  const repo: PedidosRepo = {
    getById: async () => ({ ...pedido, ...overrides }),
    claim: async () => {
      if (attempt) return { attempt: { ...attempt }, acquired: false };
      attempt = { id: 'tentativa-1', pedido_id: pedido.id, operacao_id: input.operacao_id, forma: 'pix', estado: 'criando', asaas_payment_id: null, qr_code_pix: null, pix_copia_e_cola: null, expira_em: null, claim_token: 'token' };
      return { attempt: { ...attempt }, acquired: true };
    },
    save: async (_id, _token, patch) => { events.push('save:' + (patch.asaas_payment_id ?? patch.estado ?? 'qr')); Object.assign(attempt!, patch); return { ...attempt! }; },
  };
  const externalPayments: string[] = [];
  const asaas = {
    criarCliente: vi.fn(async () => ({ ok: true, data: { id: 'cus_1', name: 'Maria', cpfCnpj: '24971563792' } })),
    criarCobranca: vi.fn(async (payload) => { externalPayments.push(payload.externalReference); events.push('create'); return { ok: true, data: { id: 'pay_1', status: 'PENDING', value: 42.5, billingType: 'PIX' } }; }),
    obterQrCodePix: vi.fn(async () => { events.push('qr'); return { ok: true, data: { encodedImage: 'base64', payload: 'copia', expirationDate: '2026-10-01' } }; }),
  } as unknown as AsaasClient;
  return { repo, asaas, events, externalPayments, attempt: () => attempt, call: () => handleCreatePixPayment(input, { asaasClient: asaas, pedidos: repo }) };
}
describe('PIX com tentativa durável', () => {
  it('duas chamadas concorrentes criam uma única cobrança externa', async () => {
    const t = setup();
    const results = await Promise.all([t.call(), t.call()]);
    expect(t.externalPayments).toEqual(['tentativa-1']);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(t.attempt()).toMatchObject({ estado: 'pendente', asaas_payment_id: 'pay_1' });
  });
  it('persiste ID externo antes de buscar QR e reutiliza tentativa no retry', async () => {
    const t = setup();
    expect((await t.call()).ok).toBe(true);
    expect((await t.call()).ok).toBe(true);
    expect(t.events.indexOf('save:pay_1')).toBeLessThan(t.events.indexOf('qr'));
    expect(t.externalPayments).toHaveLength(1);
  });
  it('timeout externo fica em reconciliação e retry não cria cobrança', async () => {
    const t = setup();
    vi.mocked(t.asaas.criarCobranca).mockImplementation(async () => { t.externalPayments.push('incerta'); return { ok: false, error: { status: 0, message: 'timeout' } }; });
    expect(await t.call()).toMatchObject({ ok: false, error: { code: 'PAGAMENTO_RECONCILIACAO' } });
    await t.call();
    expect(t.attempt()?.estado).toBe('reconciliacao');
    expect(t.externalPayments).toEqual(['incerta']);
  });
  it('falha no salvamento do ID mantém bloqueio mesmo se a persistência inteira estiver indisponível', async () => {
    const t = setup();
    t.repo.save = async () => { throw new Error('db offline'); };
    expect(await t.call()).toMatchObject({ ok: false, error: { code: 'PAGAMENTO_RECONCILIACAO' } });
    await t.call();
    expect(t.externalPayments).toHaveLength(1);
    expect(t.attempt()?.estado).toBe('criando');
  });
  it('falha apenas no QR permite buscar de novo sem criar cobrança', async () => {
    const t = setup();
    vi.mocked(t.asaas.obterQrCodePix).mockResolvedValueOnce({ ok: false, error: { status: 502, message: 'unavailable' } });
    expect(await t.call()).toMatchObject({ ok: false, error: { code: 'PIX_QR_INDISPONIVEL' } });
    expect(t.attempt()).toMatchObject({ estado: 'pendente', asaas_payment_id: 'pay_1' });
    expect((await t.call()).ok).toBe(true);
    expect(t.externalPayments).toHaveLength(1);
  });
  it.each([{ cliente_id: 'outro' }, { status: 'cancelado' }, { status: 'entregue' }, { pago_em: 'hoje' }, { forma_pagamento: 'cartao' }, { snapshot_valido: false }, { total_centavos: 0 }])('rejeita pedido inelegível %j antes do gateway', async (patch) => {
    const t = setup(patch);
    expect((await t.call()).ok).toBe(false);
    expect(t.attempt()).toBeNull();
    expect(t.externalPayments).toHaveLength(0);
  });
  it('recusa explícita do gateway encerra tentativa e não é reexecutada com a mesma operação', async () => {
    const t = setup();
    vi.mocked(t.asaas.criarCobranca).mockResolvedValue({ ok: false, error: { status: 400, message: 'invalid' } });
    expect((await t.call()).ok).toBe(false);
    expect(t.attempt()?.estado).toBe('recusado');
    await t.call();
    expect(t.asaas.criarCobranca).toHaveBeenCalledTimes(1);
  });
});

describe('fronteira HTTP do PIX', () => {
  const pedidoId = '44444444-0000-4000-8000-000000000001';
  const request = (method = 'POST', token = 'Bearer verified', origin?: string) => new Request('https://api.example/px', { method,
    headers: { Authorization: token, ...(origin ? { Origin: origin } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify({ pedido_id: pedidoId, operacao_id: pedidoId }) } : {}),
  });
  it('credencial verificada precede qualquer client privilegiado', async () => {
    const events: string[] = [];
    const t = setup();
    const http = createPixHttpHandler({ allowedOrigins: ['https://cliente.example'],
      authenticate: async () => { events.push('auth'); return 'cliente-1'; },
      createDeps: () => { events.push('privileged'); return { asaasClient: t.asaas, pedidos: t.repo }; },
    });
    await http(request());
    expect(events).toEqual(['auth', 'privileged']);
  });
  it('não cria cliente privilegiado com sessão ausente ou inválida', async () => {
    const createDeps = vi.fn();
    const http = createPixHttpHandler({ allowedOrigins: [], authenticate: async () => null, createDeps });
    expect((await http(request())).status).toBe(401);
    expect((await http(request('POST', ''))).status).toBe(401);
    expect(createDeps).not.toHaveBeenCalled();
  });
  it('POST exclusivo e preflight limitado às origens configuradas', async () => {
    const authenticate = vi.fn(); const createDeps = vi.fn();
    const http = createPixHttpHandler({ allowedOrigins: ['https://cliente.example'], authenticate, createDeps });
    expect((await http(request('GET'))).status).toBe(405);
    expect((await http(request('OPTIONS', '', 'https://evil.example'))).status).toBe(403);
    const preflight = await http(request('OPTIONS', '', 'https://cliente.example'));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://cliente.example');
    expect(authenticate).not.toHaveBeenCalled(); expect(createDeps).not.toHaveBeenCalled();
  });
});
