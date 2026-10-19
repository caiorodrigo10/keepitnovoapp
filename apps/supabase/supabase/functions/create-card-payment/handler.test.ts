import { describe, expect, it, vi } from 'vitest';
import { createAsaasClient } from '../_shared/asaas';
import { sandboxCard, sandboxHolder } from '../_shared/__fixtures__/card.fixtures';
import type { DurablePaymentAttempt } from '../_shared/payment-attempt';
import type { PedidosRepo } from '../create-pix-payment/handler';
import { createCardHttpHandler, handleCreateCardPayment, trustedPayerIp } from './handler';

const id = '44444444-0000-4000-8000-000000000001';
const input = { pedido_id: id, operacao_id: id, usuario_id: 'owner', cartao: sandboxCard, titular: sandboxHolder, remoteIp: '203.0.113.10', salvar_cartao: true };
function setup(status: string | number = 'CONFIRMED', options: { metadata?: boolean; saveFails?: boolean; saveCommittedThenFails?: boolean; savedCardUnavailable?: boolean; invalidateFails?: boolean } = {}) {
  let attempt: DurablePaymentAttempt | null = null;
  const payloads: unknown[] = [];
  const writes: unknown[] = [];
  const savedTokens: unknown[] = [];
  const warnings: unknown[] = [];
  const lostResponses: unknown[] = [];
  const cardOperations: unknown[] = [];
  const invalidatedCards: unknown[] = [];
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
      : Response.json({ id: 'pay_sandbox', status, billingType: 'CREDIT_CARD', value: 42.5,
        ...(options.metadata === false ? {} : { creditCard: { creditCardToken: 'token_sandbox', creditCardBrand: 'VISA', creditCardNumber: '4242' } }) });
  };
  const cards = {
    customerStore: {
      getClientIdentity: async () => ({ id: 'owner', nome: 'Cliente Sintético', cpf: sandboxHolder.cpfCnpj }),
      claim: async () => ({ kind: 'ready' as const, customerId: 'cus_sandbox' }),
      waitForReady: async () => 'cus_sandbox', finish: async () => undefined, recover: async () => undefined, reconcile: async () => undefined,
    },
    registrarCompra: async (operation: unknown) => {
      cardOperations.push(operation);
      if (options.savedCardUnavailable && (operation as { cartaoSalvoId?: string | null }).cartaoSalvoId) throw new Error('CARTAO_INDISPONIVEL');
      return { id, estado: 'preparada', salvarCartao: true, avisoCodigo: null };
    },
    obterCartao: async (card: unknown) => {
      cardOperations.push(card);
      return { id: 'cartao-a', customerId: 'cus_sandbox', token: 'token_cartao_a', bandeira: 'VISA', ultimo4: '4242' };
    },
    invalidarCartao: async (card: unknown) => {
      invalidatedCards.push(card);
      if (options.invalidateFails) throw new Error('BANCO_INDISPONIVEL');
      attempt = { ...attempt!, estado: 'recusado' };
      return { id, estado: 'invalidada', salvarCartao: false, avisoCodigo: 'CARTAO_INVALIDADO' };
    },
    salvarTokenCompra: async (token: unknown) => { if (options.saveFails) throw new Error('BANCO_INDISPONIVEL'); savedTokens.push(token); if (options.saveCommittedThenFails) throw new Error('RESPOSTA_PERDIDA'); return { id, estado: 'processando', salvarCartao: true, avisoCodigo: null }; },
    marcarNaoSalvo: async (warning: unknown) => { warnings.push(warning); return { id, estado: 'processando', salvarCartao: true, avisoCodigo: options.saveCommittedThenFails ? null : 'nao_salvo' }; },
    marcarRespostaCobrancaPerdida: async (operation: unknown) => { lostResponses.push(operation); return { id, estado: 'reconciliacao', salvarCartao: true, avisoCodigo: null }; },
  };
  const deps = { enabled: true, pedidos, cards, asaasClient: createAsaasClient({ baseUrl: 'https://sandbox.invalid', apiKey: 'test-only', fetchImpl }) };
  return { deps, writes, payloads, savedTokens, warnings, lostResponses, cardOperations, invalidatedCards, attempt: () => attempt,
    call: (salvar_cartao = true) => handleCreateCardPayment({ ...input, salvar_cartao }, deps),
    callAbsent: () => handleCreateCardPayment({ ...input, salvar_cartao: undefined }, deps) };
}
describe('cartão à vista com tentativa durável', () => {
  it.each([false, undefined])('digitado sem salvar continua com flag desligada: %s', async (salvar_cartao) => {
    const t = setup();
    const result = await handleCreateCardPayment({ ...input, salvar_cartao }, { ...t.deps, enabled: false });
    expect(result).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
    expect(t.payloads).toHaveLength(1);
    expect(t.savedTokens).toHaveLength(0);
  });

  it.each([
    { ...input, salvar_cartao: true },
    { pedido_id: id, operacao_id: id, usuario_id: 'owner', remoteIp: '203.0.113.10', cartao_salvo_id: 'cartao-a' },
  ])('recusa operação dependente de token antes do claim', async (paymentInput) => {
    const t = setup();
    const claim = vi.spyOn(t.deps.pedidos, 'claim');
    const result = await handleCreateCardPayment(paymentInput as never, { ...t.deps, enabled: false });
    expect(result).toMatchObject({ ok: false, error: { status: 503, code: 'CARD_TOKENIZATION_DISABLED' } });
    expect(claim).not.toHaveBeenCalled();
    expect(t.payloads).toHaveLength(0);
    expect(t.cardOperations).toHaveLength(0);
    expect(t.savedTokens).toHaveLength(0);
    expect(t.writes).toHaveLength(0);
  });

  it('usa total do pedido e mantém pendente até confirmação persistida, sem cartão nos snapshots', async () => {
    const t = setup();
    expect(await t.call()).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
    expect(t.payloads).toEqual([{ customer: 'cus_sandbox', billingType: 'CREDIT_CARD', value: 42.5, dueDate: expect.any(String), externalReference: id, creditCard: sandboxCard, creditCardHolderInfo: sandboxHolder, remoteIp: '203.0.113.10' }]);
    expect(t.attempt()).toMatchObject({ asaas_payment_id: 'pay_sandbox', estado: 'pendente' });
    expect(JSON.stringify(t.writes)).not.toContain(sandboxCard.number);
    expect(JSON.stringify(t.writes)).not.toContain('ccv');
  });
  it('cobra uma única vez e guarda somente metadados validados quando salvar foi autorizado', async () => {
    const t = setup();
    expect(await t.call(true)).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
    expect(t.payloads).toHaveLength(1);
    expect(t.cardOperations).toHaveLength(1);
    expect(t.savedTokens).toEqual([{ operacaoId: id, customerId: 'cus_sandbox', token: 'token_sandbox', bandeira: 'VISA', ultimo4: '4242' }]);
  });
  it.each([false, undefined])('nunca persiste token quando salvar_cartao é %s', async (salvar_cartao) => {
    const t = setup();
    expect(await (salvar_cartao === undefined ? t.callAbsent() : t.call(salvar_cartao))).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
    expect(t.payloads).toHaveLength(1);
    expect(t.savedTokens).toHaveLength(0);
  });
  it('cobra e persiste o ID antes de avisar que o token não voltou na resposta', async () => {
    const t = setup('CONFIRMED', { metadata: false });
    expect(await t.call(true)).toMatchObject({ ok: true, data: { tentativa: { avisoCartao: 'nao_salvo' } } });
    expect(t.attempt()).toMatchObject({ asaas_payment_id: 'pay_sandbox', estado: 'pendente' });
    expect(t.savedTokens).toHaveLength(0);
    expect(t.warnings).toEqual([{ operacaoId: id }]);
  });
  it('mantém a cobrança persistida e devolve aviso separado se o banco falhar ao salvar metadados', async () => {
    const t = setup('CONFIRMED', { saveFails: true });
    expect(await t.call(true)).toMatchObject({ ok: true, data: { tentativa: { avisoCartao: 'nao_salvo' } } });
    expect(t.attempt()).toMatchObject({ asaas_payment_id: 'pay_sandbox', estado: 'pendente' });
    expect(t.payloads).toHaveLength(1);
    expect(t.savedTokens).toHaveLength(0);
    expect(t.warnings).toEqual([{ operacaoId: id }]);
  });
  it('não exibe aviso falso quando a resposta se perde depois de persistir o token', async () => {
    const t = setup('CONFIRMED', { saveCommittedThenFails: true });
    const result = await t.call(true);
    expect(result).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
    if (!result.ok) throw new Error('resultado financeiro inesperado');
    expect(result.data.tentativa).not.toHaveProperty('avisoCartao');
    expect(t.savedTokens).toHaveLength(1);
  });
  it('guarda metadados temporários em análise somente com consentimento', async () => {
    const t = setup('AWAITING_RISK_ANALYSIS');
    expect(await t.call(true)).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
    expect(t.savedTokens).toHaveLength(1);
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
  it('marca duravelmente a resposta de criação perdida antes de delegar a conciliação', async () => {
    const t = setup(0);

    await t.call(true);

    expect(t.lostResponses).toEqual([{ operacaoId: id }]);
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
  it('deixa a reserva sob lock trocar Pix recusado por cartão no mesmo pedido', async () => {
    const t = setup();
    t.deps.pedidos.getById = async () => ({ id, cliente_id: 'owner', cliente_nome: 'Cliente Sintético', cliente_cpf: sandboxHolder.cpfCnpj,
      status: 'aguardando_pagamento', forma_pagamento: 'pix', pago_em: null, total_centavos: 4250, total_pago_reais: 42.5, snapshot_valido: true });

    expect(await t.call(false)).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
    expect(t.payloads).toHaveLength(1);
  });
  it('cobra o cartão salvo do dono com o customer e token resolvidos no servidor', async () => {
    const t = setup();
    const result = await handleCreateCardPayment({
      pedido_id: id, operacao_id: id, usuario_id: 'owner', cartao_salvo_id: 'cartao-a', remoteIp: '203.0.113.10',
    } as never, t.deps);

    expect(result).toMatchObject({ ok: true, data: { tentativa: { estado: 'pendente' } } });
    expect(t.cardOperations).toContainEqual({ clienteId: 'owner', cartaoId: 'cartao-a', ambiente: 'sandbox' });
    expect(t.payloads).toEqual([{
      customer: 'cus_sandbox', billingType: 'CREDIT_CARD', value: 42.5, dueDate: expect.any(String), externalReference: id,
      creditCardToken: 'token_cartao_a', remoteIp: '203.0.113.10',
    }]);
    expect(JSON.stringify(t.payloads)).not.toContain(sandboxCard.number);
  });
  it.each(['de outra conta', 'removido', 'de outro ambiente'])('rejeita cartão salvo %s antes do gateway', async () => {
    const t = setup('CONFIRMED', { savedCardUnavailable: true });
    const result = await handleCreateCardPayment({
      pedido_id: id, operacao_id: id, usuario_id: 'owner', cartao_salvo_id: 'cartao-indisponivel', remoteIp: '203.0.113.10',
    } as never, t.deps);

    expect(result).toMatchObject({ ok: false, error: { code: 'CARTAO_INDISPONIVEL' } });
    expect(t.payloads).toHaveLength(0);
  });
  it('recusa comum preserva o cartão salvo e encerra a tentativa para recuperação', async () => {
    const t = setup();
    t.deps.asaasClient.criarCobranca = vi.fn(async () => ({ ok: false as const, error: { status: 400, code: 'CARD_GATEWAY_ERROR', message: 'recusado', cardFailure: { categoria: 'recusado' as const } } }));

    expect(await handleCreateCardPayment({ pedido_id: id, operacao_id: id, usuario_id: 'owner', cartao_salvo_id: 'cartao-a', remoteIp: '203.0.113.10' } as never, t.deps))
      .toMatchObject({ ok: false, error: { code: 'PAGAMENTO_RECUSADO' } });
    expect(t.invalidatedCards).toHaveLength(0);
    expect(t.attempt()?.estado).toBe('recusado');
  });
  it('token inválido confirmado remove o cartão e encerra a tentativa', async () => {
    const t = setup();
    t.deps.asaasClient.criarCobranca = vi.fn(async () => ({ ok: false as const, error: { status: 400, code: 'CARD_GATEWAY_ERROR', message: 'token inválido', cardFailure: { categoria: 'token_invalido' as const } } }));

    expect(await handleCreateCardPayment({ pedido_id: id, operacao_id: id, usuario_id: 'owner', cartao_salvo_id: 'cartao-a', remoteIp: '203.0.113.10' } as never, t.deps))
      .toMatchObject({ ok: false, error: { code: 'CARTAO_TOKEN_INVALIDO' } });
    expect(t.invalidatedCards).toEqual([{ clienteId: 'owner', cartaoId: 'cartao-a', operacaoId: id }]);
    expect(t.attempt()?.estado).toBe('recusado');
  });
  it('falha ao apagar token inválido mantém bloqueio de reconciliação sem aviso de remoção', async () => {
    const t = setup('CONFIRMED', { invalidateFails: true });
    t.deps.asaasClient.criarCobranca = vi.fn(async () => ({ ok: false as const, error: { status: 400, code: 'CARD_GATEWAY_ERROR', message: 'token inválido', cardFailure: { categoria: 'token_invalido' as const } } }));

    expect(await handleCreateCardPayment({ pedido_id: id, operacao_id: id, usuario_id: 'owner', cartao_salvo_id: 'cartao-a', remoteIp: '203.0.113.10' } as never, t.deps))
      .toMatchObject({ ok: false, error: { code: 'PAGAMENTO_RECONCILIACAO' } });
    expect(t.invalidatedCards).toHaveLength(1);
    expect(t.attempt()?.estado).toBe('reconciliacao');
  });
  it('timeout do cartão salvo não remove nem recobra', async () => {
    const t = setup();
    t.deps.asaasClient.criarCobranca = vi.fn(async () => ({ ok: false as const, error: { status: 0, code: 'TIMEOUT', message: 'timeout', cardFailure: { categoria: 'incerto' as const } } }));
    const saved = { pedido_id: id, operacao_id: id, usuario_id: 'owner', cartao_salvo_id: 'cartao-a', remoteIp: '203.0.113.10' } as never;

    expect(await handleCreateCardPayment(saved, t.deps)).toMatchObject({ ok: false, error: { code: 'PAGAMENTO_RECONCILIACAO' } });
    await handleCreateCardPayment(saved, t.deps);
    expect(t.invalidatedCards).toHaveLength(0);
    expect(t.deps.asaasClient.criarCobranca).toHaveBeenCalledTimes(1);
  });
});
describe('fronteira HTTP cartão', () => {
  const request = (extra = {}, token = 'Bearer user') => new Request('https://api.invalid/card', { method: 'POST', headers: { authorization: token }, body: JSON.stringify({ pedido_id: id, operacao_id: id, cartao: sandboxCard, titular: sandboxHolder, ...extra }) });
  it('verifica sessão antes de client privilegiado, sem confiar no usuário do body', async () => {
    const events: string[] = []; const t = setup();
    const handler = createCardHttpHandler({ allowedOrigins: [], authenticate: async () => { events.push('auth'); return 'owner'; }, authorizeOrder: async () => { events.push('authorize'); return true; }, trustedIp: () => '203.0.113.10', createDeps: () => { events.push('admin'); return t.deps; } });
    expect((await handler(request())).status).toBe(200); expect(events).toEqual(['auth', 'authorize', 'admin']);
  });
  it.each([
    [{ salvar_cartao: true }, 'consentimento de salvar'],
    [{ cartao_salvo_id: 'cartao-a', cartao: undefined, titular: undefined }, 'cartão salvo'],
  ])('bloqueia %s depois da autorização e antes de IP ou factory', async (extra, _label) => {
    const createDeps = vi.fn();
    const authorizeOrder = vi.fn(async () => true);
    const handler = createCardHttpHandler({ allowedOrigins: [], authenticate: async () => 'owner', authorizeOrder, trustedIp: () => { throw new Error('não deveria ler IP'); }, createDeps });
    const body = 'cartao_salvo_id' in extra
      ? new Request('https://api.invalid/card', { method: 'POST', headers: { authorization: 'Bearer user' }, body: JSON.stringify({ pedido_id: id, operacao_id: id, cartao_salvo_id: 'cartao-a' }) })
      : request(extra);
    const response = await handler(body);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'CARD_TOKENIZATION_DISABLED' } });
    expect(authorizeOrder).toHaveBeenCalledOnce();
    expect(createDeps).not.toHaveBeenCalled();
  });
  it('encaminha o consentimento HTTP explícito até o salvamento de metadados', async () => {
    const t = setup();
    const handler = createCardHttpHandler({ enabled: true, allowedOrigins: [], authenticate: async () => 'owner', authorizeOrder: async () => true,
      trustedIp: () => '203.0.113.10', createDeps: () => t.deps });
    expect((await handler(request({ salvar_cartao: true }))).status).toBe(200);
    expect(t.savedTokens).toHaveLength(1);
  });
  it('aceita somente IDs na variante de cartão salvo e rejeita body misto antes da factory', async () => {
    const t = setup();
    const createDeps = vi.fn(() => t.deps);
    const handler = createCardHttpHandler({ enabled: true, allowedOrigins: [], authenticate: async () => 'owner', authorizeOrder: async () => true,
      trustedIp: () => '203.0.113.10', createDeps });
    const saved = new Request('https://api.invalid/card', { method: 'POST', headers: { authorization: 'Bearer user' },
      body: JSON.stringify({ pedido_id: id, operacao_id: id, cartao_salvo_id: 'cartao-a' }) });
    const mixed = new Request('https://api.invalid/card', { method: 'POST', headers: { authorization: 'Bearer user' },
      body: JSON.stringify({ pedido_id: id, operacao_id: id, cartao_salvo_id: 'cartao-a', cartao: sandboxCard, titular: sandboxHolder }) });

    expect((await handler(saved)).status).toBe(200);
    expect((await handler(mixed)).status).toBe(400);
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
  it.each([
    ['IPv4', '203.0.113.10'],
    ['IPv6', '2001:db8:85a3::8a2e:370:7334'],
    ['IPv6 com IPv4 embutido', '::ffff:192.0.2.1'],
  ])('aceita %s fornecido pelo gateway em cf-connecting-ip', (_kind, ip) => {
    const req = (headers: Record<string, string>) => new Request('https://api.invalid', { headers });
    expect(trustedPayerIp(req({ 'cf-connecting-ip': ip }))).toBe(ip);
  });
  it.each([
    [{}, 'header ausente'],
    [{ 'cf-connecting-ip': 'spoof, 203.0.113.10' }, 'lista de IPs'],
    [{ 'cf-connecting-ip': '999.0.0.1' }, 'IPv4 inválido'],
    [{ 'cf-connecting-ip': '2001:db8:::1' }, 'IPv6 inválido'],
    [{ 'x-forwarded-for': '203.0.113.10' }, 'somente x-forwarded-for'],
    [{ 'x-payment-client-ip': '203.0.113.10' }, 'somente x-payment-client-ip'],
  ])('falha fechado quando recebe %s', (headers, _label) => {
    expect(trustedPayerIp(new Request('https://api.invalid', { headers }))).toBeNull();
  });
});
