import { describe, expect, it, vi } from 'vitest';
import { createTokenizeCardHttpHandler } from './handler.ts';
import { sandboxCard, sandboxHolder } from '../_shared/__fixtures__/card.fixtures';

const operationId = 'bbbbbbbb-0000-4000-8000-000000000001';
const request = (body: unknown, headers: Record<string, string> = {}) => new Request('https://edge.invalid/tokenize-card', { method: 'POST', headers: { authorization: 'Bearer session', 'cf-connecting-ip': '203.0.113.10', ...headers }, body: JSON.stringify(body) });

describe('fronteira HTTP de cadastro de cartão', () => {
  it.each([
    { acao: 'configuracao' },
    { acao: 'cadastrar', operacao_id: operationId, cartao: sandboxCard, titular: sandboxHolder },
  ])('desliga por padrão sem construir serviço: %j', async (body) => {
    const createDeps = vi.fn();
    const amountCents = vi.fn(() => 137);
    const handler = createTokenizeCardHttpHandler({
      allowedOrigins: [], amountCents, authenticate: async () => 'cliente-a',
      authorizeClient: async () => true, createDeps,
    });

    const response = await handler(request(body));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: {
      code: 'CARD_TOKENIZATION_DISABLED',
      message: 'Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.',
    } });
    expect(createDeps).not.toHaveBeenCalled();
    expect(amountCents).not.toHaveBeenCalled();
  });

  it('lê configuração autenticada sem criar client privilegiado, claim ou chamada financeira', async () => {
    const createDeps = vi.fn();
    const handler = createTokenizeCardHttpHandler({ enabled: true, allowedOrigins: [], amountCents: () => 137, authenticate: async () => 'cliente-a', authorizeClient: async () => true, trustedIp: () => '203.0.113.10', createDeps });
    const response = await handler(request({ acao: 'configuracao' }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ disponivel: true, valorCentavos: 137 }); expect(createDeps).not.toHaveBeenCalled();
  });

  it('valida sessão e cliente antes de criar serviço e envia apenas operacao_id, cartão e titular', async () => {
    const createDeps = vi.fn(() => ({ ambiente: 'sandbox', cards: {}, asaas: {} }));
    const handler = createTokenizeCardHttpHandler({ enabled: true, allowedOrigins: [], amountCents: () => 137, authenticate: async () => 'cliente-a', authorizeClient: async () => true, trustedIp: () => '203.0.113.10', createDeps: createDeps as never, advance: (async () => ({ id: operationId, estado: 'estorno_pendente', valorCentavos: 137 })) as never });
    expect((await handler(request({ acao: 'cadastrar', operacao_id: operationId, cartao: sandboxCard, titular: sandboxHolder }))).status).toBe(200);
    expect(createDeps).toHaveBeenCalledTimes(1);
  });

  it.each([{ valorCentavos: 1 }, { customer: 'cus_forjado' }, { token: 'tok_forjado' }, { acao: 'cadastrar', operacao_id: operationId, cartao: sandboxCard, titular: sandboxHolder, extra: true }])('rejeita campos e valores do app antes do gateway: %j', async (body) => {
    const createDeps = vi.fn();
    const handler = createTokenizeCardHttpHandler({ enabled: true, allowedOrigins: [], amountCents: () => 137, authenticate: async () => 'cliente-a', authorizeClient: async () => true, trustedIp: () => null, createDeps });
    expect((await handler(request(body))).status).toBe(400); expect(createDeps).not.toHaveBeenCalled();
  });

  it('preserva OPTIONS, autenticação, autorização e validação antes da guarda', async () => {
    const createDeps = vi.fn();
    const disabled = createTokenizeCardHttpHandler({ allowedOrigins: [], amountCents: () => 137, authenticate: async () => null, authorizeClient: async () => false, createDeps });
    expect((await disabled(new Request('https://edge.invalid/tokenize-card', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await disabled(request({ acao: 'configuracao' }))).status).toBe(401);
    expect((await disabled(request({ acao: 'cadastrar', operacao_id: operationId, cartao: sandboxCard, titular: sandboxHolder }))).status).toBe(401);
    expect(createDeps).not.toHaveBeenCalled();

    const unauthorized = createTokenizeCardHttpHandler({ enabled: false, allowedOrigins: [], amountCents: () => 137, authenticate: async () => 'cliente-a', authorizeClient: async () => false, createDeps });
    expect((await unauthorized(request({ acao: 'cadastrar', operacao_id: operationId, cartao: sandboxCard, titular: sandboxHolder }))).status).toBe(403);
    expect((await unauthorized(request({ acao: 'invalid' }))).status).toBe(400);
    expect(createDeps).not.toHaveBeenCalled();
  });
});
