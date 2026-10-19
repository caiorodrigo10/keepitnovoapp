import { describe, expect, it, vi } from 'vitest';

import { createAsaasClient } from './asaas';
import { cardTokenizationResponseFixture, sandboxCard, sandboxHolder } from './__fixtures__/card.fixtures';
const cardCharge = { customer: 'cus_sandbox', billingType: 'CREDIT_CARD' as const, value: 129.9, dueDate: '2026-09-30', externalReference: 'attempt', creditCard: sandboxCard, creditCardHolderInfo: sandboxHolder, remoteIp: '203.0.113.10' };
import {
  asaasErrorBodyFixture,
  customerFixture,
  paymentPixFixture,
  pixQrCodeFixture,
  refundFixture,
  transferFixture,
} from './__fixtures__/asaas.fixtures';

const BASE_URL = 'https://api-sandbox.asaas.com/v3';
const API_KEY = '$aact_hmlg_test-key-nunca-deve-vazar';

/** `Response` mínimo o bastante para `request()` em `asaas.ts` — sem depender de um `Response` real do runtime. */
function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** `vi.fn()` tipado com a assinatura de `typeof fetch` — evita que `mock.calls[0]` infira uma tupla vazia. */
function mockFetch(status: number, body: unknown) {
  return vi.fn((_url: URL | RequestInfo, _init?: RequestInit) => Promise.resolve(fakeResponse(status, body)));
}

function mockFetchRejecting(error: Error) {
  return vi.fn((_url: URL | RequestInfo, _init?: RequestInit) => Promise.reject(error));
}

function fetchThatFailsIfCalled() {
  return vi.fn((_url: URL | RequestInfo, _init?: RequestInit) => {
    throw new Error('[test] fetchImpl não deveria ter sido chamado (stub reservado).');
  });
}

describe('createAsaasClient', () => {
  describe('criarCliente — POST /customers', () => {
    it('caminho feliz: devolve o customer normalizado em AsaasResult', async () => {
      const fetchImpl = mockFetch(200, customerFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.criarCliente({ name: 'Maria Silva', cpfCnpj: '24971563792' });

      expect(result).toEqual({ ok: true, data: customerFixture });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/customers`);
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ access_token: API_KEY, 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body as string)).toEqual({ name: 'Maria Silva', cpfCnpj: '24971563792' });
    });

    it('erro HTTP: devolve ok:false com status e code do Asaas, sem lançar exceção', async () => {
      const fetchImpl = mockFetch(400, asaasErrorBodyFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.criarCliente({ name: 'Maria Silva', cpfCnpj: '00000000000' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(400);
        expect(result.error.code).toBe('invalid_customer');
        expect(result.error.message).toContain('O cliente informado não existe');
        expect(JSON.stringify(result.error)).not.toContain(API_KEY);
      }
    });
  });

  describe('criarCobranca — POST /payments (PIX)', () => {
    const pixInput = {
      customer: 'cus_000005401844',
      billingType: 'PIX' as const,
      value: 129.9,
      dueDate: '2026-08-28',
      externalReference: 'PED-uuid',
    };

    it('caminho feliz: cria cobrança PIX e devolve o payment', async () => {
      const fetchImpl = mockFetch(200, paymentPixFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.criarCobranca(pixInput);

      expect(result).toEqual({ ok: true, data: paymentPixFixture });
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/payments`);
      expect(JSON.parse(init.body as string)).toEqual(pixInput);
    });

    it('erro HTTP: devolve ok:false com status correto', async () => {
      const fetchImpl = mockFetch(422, asaasErrorBodyFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.criarCobranca(pixInput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(422);
      }
    });

    it('envia crédito à vista sem parcelamento e retém somente metadados seguros do cartão no servidor', async () => {
      const fetchImpl = mockFetch(200, { id: 'pay_card', status: 'CONFIRMED', value: 129.9, billingType: 'CREDIT_CARD', creditCard: cardTokenizationResponseFixture, creditCardToken: 'token_que_deve_ser_descartado' });
      const result = await createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl }).criarCobranca(cardCharge);
      expect(result).toEqual({ ok: true, data: {
        id: 'pay_card', status: 'CONFIRMED', value: 129.9, billingType: 'CREDIT_CARD',
        cardTokenMetadata: { token: cardTokenizationResponseFixture.creditCardToken, bandeira: 'VISA', ultimo4: '4242' },
      } });
      const payload = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string);
      expect(payload).toEqual(cardCharge);
      for (const key of ['installmentCount', 'installmentValue', 'totalValue']) expect(payload).not.toHaveProperty(key);
    });
    it('envia cobrança por token sem dados completos do cartão, titular, CVV ou parcelamento', async () => {
      const fetchImpl = mockFetch(200, { id: 'pay_token', status: 'CONFIRMED', value: 129.9, billingType: 'CREDIT_CARD' });
      const result = await createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl }).criarCobranca({
        customer: 'cus_sandbox', billingType: 'CREDIT_CARD', value: 129.9, dueDate: '2026-09-30',
        externalReference: 'attempt-token', remoteIp: '203.0.113.10', creditCardToken: 'token_ficticio_sanitizado',
      });

      expect(result).toEqual({ ok: true, data: { id: 'pay_token', status: 'CONFIRMED', value: 129.9, billingType: 'CREDIT_CARD' } });
      const payload = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string);
      expect(payload).toEqual({
        customer: 'cus_sandbox', billingType: 'CREDIT_CARD', value: 129.9, dueDate: '2026-09-30',
        externalReference: 'attempt-token', remoteIp: '203.0.113.10', creditCardToken: 'token_ficticio_sanitizado',
      });
      for (const key of ['creditCard', 'creditCardHolderInfo', 'ccv', 'installmentCount', 'installmentValue', 'totalValue']) expect(payload).not.toHaveProperty(key);
    });
    it.each(['http', 'timeout'] as const)('redige exceção e resposta %s que ecoam PAN/CVV', async (mode) => {
      const leak = JSON.stringify({ ...sandboxCard, apiKey: API_KEY });
      const fetchImpl = mode === 'timeout' ? mockFetchRejecting(new Error(leak)) : mockFetch(400, { errors: [{ code: leak, description: leak }], body: leak });
      const result = await createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl }).criarCobranca(cardCharge);
      expect(result).toMatchObject({ ok: false, error: { status: mode === 'timeout' ? 0 : 400 } });
      expect(JSON.stringify(result)).not.toContain(sandboxCard.number);
      expect(JSON.stringify(result)).not.toContain(API_KEY);
      if (!result.ok) expect(result.error).not.toHaveProperty('details');
    });

  });

  describe('obterQrCodePix — GET /payments/{id}/pixQrCode', () => {
    it('caminho feliz: devolve encodedImage/payload/expirationDate', async () => {
      const fetchImpl = mockFetch(200, pixQrCodeFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.obterQrCodePix('pay_080225913252');

      expect(result).toEqual({ ok: true, data: pixQrCodeFixture });
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/payments/pay_080225913252/pixQrCode`);
      expect(init.method).toBe('GET');
    });

    it('erro HTTP: devolve ok:false com status correto', async () => {
      const fetchImpl = mockFetch(404, { errors: [{ description: 'Cobrança não encontrada.' }] });
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.obterQrCodePix('pay_inexistente');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(404);
        expect(result.error.message).toContain('Cobrança não encontrada');
      }
    });
  });

  describe('estornarCobranca — POST /payments/{id}/refund', () => {
    it('caminho feliz sem body (estorno total): devolve o payment com status atualizado', async () => {
      const fetchImpl = mockFetch(200, refundFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.estornarCobranca('pay_080225913252');

      expect(result).toEqual({ ok: true, data: refundFixture });
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/payments/pay_080225913252/refund`);
      expect(init.body).toBeUndefined();
    });

    it('caminho feliz com body (estorno parcial)', async () => {
      const fetchImpl = mockFetch(200, refundFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      await client.estornarCobranca('pay_080225913252', { value: 50, description: 'Estorno parcial' });

      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ value: 50, description: 'Estorno parcial' });
    });

    it('erro HTTP: devolve ok:false com status correto', async () => {
      const fetchImpl = mockFetch(400, asaasErrorBodyFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.estornarCobranca('pay_080225913252');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(400);
      }
    });
  });

  describe('criarTransferencia — POST /transfers (CORE, best-effort)', () => {
    it('caminho feliz: devolve a transferência criada', async () => {
      const fetchImpl = mockFetch(200, transferFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.criarTransferencia({
        value: 100.5,
        pixAddressKey: 'lojista@example.com',
        pixAddressKeyType: 'EMAIL',
      });

      expect(result).toEqual({ ok: true, data: transferFixture });
      const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/transfers`);
    });

    it('erro HTTP: devolve ok:false com status correto', async () => {
      const fetchImpl = mockFetch(500, asaasErrorBodyFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.criarTransferencia({ value: 100.5, pixAddressKey: 'lojista@example.com' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(500);
      }
    });
  });

  describe('erro de rede (genérico — coberto uma vez, AC4)', () => {
    it('fetch rejeitando devolve AsaasResult com status: 0, sem lançar exceção', async () => {
      const fetchImpl = mockFetchRejecting(new Error('network unreachable'));
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.criarCliente({ name: 'Maria Silva', cpfCnpj: '24971563792' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ status: 0, message: expect.any(String) }),
      });
    });
  });

  describe('stubs reservados — nunca fazem chamada HTTP (AC1, AC4)', () => {
    it('criarSubconta devolve NOT_IMPLEMENTED_PILOT sem invocar o fetch injetado', async () => {
      const fetchImpl = fetchThatFailsIfCalled();
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.criarSubconta({ name: 'Loja X', email: 'loja@x.com', cpfCnpj: '11111111000191' });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ status: 0, code: 'NOT_IMPLEMENTED_PILOT' }),
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('tokeniza no endpoint exato com timeout de cartão e devolve somente metadata validado', async () => {
      const fetchImpl = mockFetch(200, { ...cardTokenizationResponseFixture, creditCardHolderInfo: sandboxHolder, extra: 'descartado' });
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.tokenizarCartao({
        customer: 'cus_000005401844',
        creditCard: sandboxCard, creditCardHolderInfo: sandboxHolder, remoteIp: '203.0.113.10',
      });

      expect(result).toEqual({ ok: true, data: { token: cardTokenizationResponseFixture.creditCardToken, bandeira: 'VISA', ultimo4: '4242' } });
      expect(fetchImpl).toHaveBeenCalledWith(`${BASE_URL}/creditCard/tokenizeCreditCard`, expect.objectContaining({ method: 'POST' }));
      expect(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)).toEqual({
        customer: 'cus_000005401844', creditCard: sandboxCard, creditCardHolderInfo: sandboxHolder, remoteIp: '203.0.113.10',
      });
    });
    it('tokeniza com uma lista positiva, sem encaminhar campos extras aninhados', async () => {
      const fetchImpl = mockFetch(200, cardTokenizationResponseFixture);
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });
      await client.tokenizarCartao({
        customer: 'cus_000005401844',
        creditCard: { ...sandboxCard, extra: 'nao-enviar' } as typeof sandboxCard,
        creditCardHolderInfo: { ...sandboxHolder, extra: 'nao-enviar' } as typeof sandboxHolder,
        remoteIp: '203.0.113.10',
      });

      const payload = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string);
      expect(payload.creditCard).not.toHaveProperty('extra');
      expect(payload.creditCardHolderInfo).not.toHaveProperty('extra');
    });
  });
});

describe('consulta e encerramento de cobrança', () => {
  it.each([
    ['consulta', (client: ReturnType<typeof createAsaasClient>) => client.consultarCobranca('pay_1')],
    ['estorno', (client: ReturnType<typeof createAsaasClient>) => client.estornarCobranca('pay_1')],
  ])('redige corpo sensível devolvido em erro de %s', async (_operation, invoke) => {
    const leak = JSON.stringify({ creditCard: sandboxCard, creditCardToken: 'token_ficticio_sanitizado', ccv: sandboxCard.ccv });
    const fetchImpl = mockFetch(400, { errors: [{ code: 'invalid_object', description: leak }], raw: leak });
    const result = await invoke(createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl }));

    expect(result).toMatchObject({ ok: false, error: { status: 400 } });
    expect(JSON.stringify(result)).not.toContain(sandboxCard.number);
    expect(JSON.stringify(result)).not.toContain('token_ficticio_sanitizado');
    if (!result.ok) expect(result.error).not.toHaveProperty('details');
  });

  it('descarta campos sensíveis de uma consulta bem-sucedida', async () => {
    const fetchImpl = mockFetch(200, { ...paymentPixFixture, creditCard: sandboxCard, creditCardToken: 'token_ficticio_sanitizado' });
    const result = await createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl }).consultarCobranca('pay_1');

    expect(result).toEqual({ ok: true, data: paymentPixFixture });
  });

  it('lista customers por referência externa estável com limite para detectar ambiguidade', async () => {
    const fetchImpl = mockFetch(200, { data: [{ id: 'cus_1', name: 'Cliente', cpfCnpj: '12345678901' }], hasMore: false });
    const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

    await expect(client.listarClientesPorReferencia('cliente/1')).resolves.toMatchObject({ ok: true, data: { hasMore: false } });
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE_URL}/customers?externalReference=cliente%2F1&limit=2`, expect.objectContaining({ method: 'GET', body: undefined }));
  });
  it('consulta por ID e referência sem enviar corpo ou preços', async () => {
    const fetchImpl = mockFetch(200, paymentPixFixture);
    const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });
    await client.consultarCobranca('pay/1');
    expect(fetchImpl).toHaveBeenLastCalledWith(`${BASE_URL}/payments/pay%2F1`, expect.objectContaining({ method: 'GET', body: undefined }));
    await client.listarCobrancasPorReferencia('attempt/1');
    expect(fetchImpl).toHaveBeenLastCalledWith(`${BASE_URL}/payments?externalReference=attempt%2F1&limit=2`, expect.objectContaining({ method: 'GET', body: undefined }));
  });
  it('encerra com DELETE e devolve prova de exclusão, sem estorno', async () => {
    const fetchImpl = mockFetch(200, { id: 'pay_1', deleted: true });
    const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });
    expect(await client.excluirCobranca('pay_1')).toEqual({ ok: true, data: { id: 'pay_1', deleted: true } });
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE_URL}/payments/pay_1`, expect.objectContaining({ method: 'DELETE', body: undefined }));
  });
  it('timeout de exclusão permanece erro incerto e não repete requisição', async () => {
    const fetchImpl = mockFetchRejecting(new Error('timeout'));
    const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });
    expect(await client.excluirCobranca('pay_1')).toMatchObject({ ok: false, error: { status: 0 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

it('limita a chamada ao gateway e trata abort como efeito incerto sem retry', async () => {
  const controller = new AbortController();
  const deadline = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    if (!init?.signal) { reject(new Error('deadline ausente')); return; }
    init.signal.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
  }));
  try {
    const result = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl }).excluirCobranca('pay_1');
    expect(deadline).toHaveBeenCalledWith(15_000);
    controller.abort(new DOMException('Gateway timeout', 'TimeoutError'));
    expect(await result).toMatchObject({ ok: false, error: { status: 0 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  } finally { deadline.mockRestore(); }
});

it('usa o timeout mínimo de 60 segundos somente para processamento de cartão', async () => {
  const deadline = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal);
  const fetchImpl = mockFetch(200, cardTokenizationResponseFixture);
  try {
    await createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl }).tokenizarCartao({
      customer: 'cus_000005401844', creditCard: sandboxCard, creditCardHolderInfo: sandboxHolder, remoteIp: '203.0.113.10',
    });
    expect(deadline).toHaveBeenCalledWith(60_000);
  } finally { deadline.mockRestore(); }
});
