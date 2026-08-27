import { describe, expect, it, vi } from 'vitest';

import { createAsaasClient } from './asaas';
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

    it('billingType CREDIT_CARD é reservado: devolve NOT_IMPLEMENTED_PILOT sem chamar o fetch injetado', async () => {
      const fetchImpl = fetchThatFailsIfCalled();
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.criarCobranca({
        customer: 'cus_000005401844',
        billingType: 'CREDIT_CARD',
        value: 129.9,
        dueDate: '2026-08-28',
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_IMPLEMENTED_PILOT' }),
      });
      expect(fetchImpl).not.toHaveBeenCalled();
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

    it('tokenizarCartao devolve NOT_IMPLEMENTED_PILOT sem invocar o fetch injetado', async () => {
      const fetchImpl = fetchThatFailsIfCalled();
      const client = createAsaasClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetchImpl });

      const result = await client.tokenizarCartao({
        customer: 'cus_000005401844',
        creditCard: { holderName: 'Maria Silva', number: '4111111111111111', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ status: 0, code: 'NOT_IMPLEMENTED_PILOT' }),
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
});
