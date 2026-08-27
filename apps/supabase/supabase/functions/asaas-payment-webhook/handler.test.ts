import { describe, expect, it, vi } from 'vitest';

import { handleAsaasWebhook } from './handler';
import type { PagamentosRepo, ResultadoConfirmacao, WebhookAsaasDeps } from './handler';

const TOKEN = 'segredo-webhook-asaas-32-chars-min';

/** `PagamentosRepo` fake cujo método lança se chamado — mesmo padrão
 * `fetchThatFailsIfCalled`/`asaasClientThatFailsIfCalled` das Stories 7.1/7.2. */
function repoThatFailsIfCalled(): PagamentosRepo {
  return {
    confirmarPagamento: vi.fn(() => {
      throw new Error('[test] confirmarPagamento não deveria ter sido chamado nesta Story.');
    }),
  };
}

function repoResolvendo(resultado: ResultadoConfirmacao, pedidoId: string | null = 'pedido-1') {
  const confirmarPagamento = vi.fn(async () => ({ resultado, pedidoId }));
  const repo: PagamentosRepo = { confirmarPagamento };
  return { repo, confirmarPagamento };
}

function deps(overrides: Partial<WebhookAsaasDeps> = {}): WebhookAsaasDeps {
  return {
    webhookToken: TOKEN,
    pedidos: repoThatFailsIfCalled(),
    ...overrides,
  };
}

const PAYLOAD_BASE = {
  id: 'evt_05b708f961d739ea7eba7e4db318f621',
  payment: {
    id: 'pay_080225913252',
    value: 129.9,
    status: 'RECEIVED',
    billingType: 'PIX',
    externalReference: 'PED-uuid',
    paymentDate: '2026-08-27',
  },
};

describe('handleAsaasWebhook (Story 7.5, AC1–AC5, AC7)', () => {
  it('token válido + PAYMENT_RECEIVED → 200 confirmado (caminho feliz)', async () => {
    const { repo, confirmarPagamento } = repoResolvendo('confirmado', 'pedido-1');

    const result = await handleAsaasWebhook(
      { headerToken: TOKEN, body: { ...PAYLOAD_BASE, event: 'PAYMENT_RECEIVED' } },
      deps({ pedidos: repo }),
    );

    expect(result).toEqual({
      status: 200,
      body: { ok: true, resultado: 'confirmado', pedido_id: 'pedido-1' },
    });
    expect(confirmarPagamento).toHaveBeenCalledWith({
      asaasPaymentId: 'pay_080225913252',
      externalReference: 'PED-uuid',
    });
  });

  it('token válido + PAYMENT_CONFIRMED → 200 confirmado (mesmo caminho feliz)', async () => {
    const { repo, confirmarPagamento } = repoResolvendo('confirmado', 'pedido-2');

    const result = await handleAsaasWebhook(
      { headerToken: TOKEN, body: { ...PAYLOAD_BASE, event: 'PAYMENT_CONFIRMED' } },
      deps({ pedidos: repo }),
    );

    expect(result).toEqual({
      status: 200,
      body: { ok: true, resultado: 'confirmado', pedido_id: 'pedido-2' },
    });
    expect(confirmarPagamento).toHaveBeenCalledTimes(1);
  });

  it('token ausente → 401, repo nunca chamado', async () => {
    const result = await handleAsaasWebhook(
      { headerToken: undefined, body: { ...PAYLOAD_BASE, event: 'PAYMENT_RECEIVED' } },
      deps(),
    );

    expect(result).toEqual({
      status: 401,
      body: { ok: false, error: { code: 'TOKEN_INVALIDO', message: expect.any(String) } },
    });
  });

  it('token inválido/não-batendo → 401, repo nunca chamado', async () => {
    const result = await handleAsaasWebhook(
      { headerToken: 'token-errado', body: { ...PAYLOAD_BASE, event: 'PAYMENT_RECEIVED' } },
      deps(),
    );

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ ok: false, error: { code: 'TOKEN_INVALIDO', message: expect.any(String) } });
  });

  it('ASAAS_WEBHOOK_TOKEN vazio no ambiente → 401 fail-closed, mesmo com header também vazio', async () => {
    const result = await handleAsaasWebhook(
      { headerToken: '', body: { ...PAYLOAD_BASE, event: 'PAYMENT_RECEIVED' } },
      deps({ webhookToken: '' }),
    );

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ ok: false, error: { code: 'TOKEN_INVALIDO', message: expect.any(String) } });
  });

  it('reentrância/idempotência: 2ª chamada com o mesmo payload retorna ja_processado, ambas 200', async () => {
    const confirmarPagamento = vi
      .fn()
      .mockResolvedValueOnce({ resultado: 'confirmado' as ResultadoConfirmacao, pedidoId: 'pedido-3' })
      .mockResolvedValueOnce({ resultado: 'ja_processado' as ResultadoConfirmacao, pedidoId: 'pedido-3' });
    const repo: PagamentosRepo = { confirmarPagamento };

    const primeira = await handleAsaasWebhook(
      { headerToken: TOKEN, body: { ...PAYLOAD_BASE, event: 'PAYMENT_RECEIVED' } },
      deps({ pedidos: repo }),
    );
    const segunda = await handleAsaasWebhook(
      { headerToken: TOKEN, body: { ...PAYLOAD_BASE, event: 'PAYMENT_RECEIVED' } },
      deps({ pedidos: repo }),
    );

    expect(primeira).toEqual({ status: 200, body: { ok: true, resultado: 'confirmado', pedido_id: 'pedido-3' } });
    expect(segunda).toEqual({ status: 200, body: { ok: true, resultado: 'ja_processado', pedido_id: 'pedido-3' } });
    expect(confirmarPagamento).toHaveBeenCalledTimes(2);
  });

  it('pedido não encontrado → 200 pedido_nao_encontrado', async () => {
    const { repo } = repoResolvendo('pedido_nao_encontrado', null);

    const result = await handleAsaasWebhook(
      { headerToken: TOKEN, body: { ...PAYLOAD_BASE, event: 'PAYMENT_RECEIVED' } },
      deps({ pedidos: repo }),
    );

    expect(result).toEqual({
      status: 200,
      body: { ok: true, resultado: 'pedido_nao_encontrado', pedido_id: null },
    });
  });

  it('payload sem payment.id nem externalReference → 200 payload_invalido, repo nunca chamado', async () => {
    const result = await handleAsaasWebhook(
      {
        headerToken: TOKEN,
        body: { id: 'evt_x', event: 'PAYMENT_RECEIVED', payment: { value: 10 } },
      },
      deps(),
    );

    expect(result).toEqual({ status: 200, body: { ok: true, resultado: 'payload_invalido' } });
  });

  it('evento não tratado (ex. PAYMENT_OVERDUE) → 200 evento_ignorado, repo nunca chamado', async () => {
    const result = await handleAsaasWebhook(
      { headerToken: TOKEN, body: { ...PAYLOAD_BASE, event: 'PAYMENT_OVERDUE' } },
      deps(),
    );

    expect(result).toEqual({ status: 200, body: { ok: true, resultado: 'evento_ignorado' } });
  });

  it('falha da RPC/repositório (lança) → 502', async () => {
    const confirmarPagamento = vi.fn(async () => {
      throw new Error('[asaas-payment-webhook] RPC confirmar_pagamento_pedido falhou: connection refused');
    });
    const repo: PagamentosRepo = { confirmarPagamento };

    const result = await handleAsaasWebhook(
      { headerToken: TOKEN, body: { ...PAYLOAD_BASE, event: 'PAYMENT_RECEIVED' } },
      deps({ pedidos: repo }),
    );

    expect(result.status).toBe(502);
    expect(result.body).toEqual({
      ok: false,
      error: { code: 'CONFIRMACAO_FALHOU', message: expect.stringContaining('connection refused') },
    });
  });

  it('body malformado (não-objeto) → 200 payload_invalido, repo nunca chamado', async () => {
    const result = await handleAsaasWebhook({ headerToken: TOKEN, body: null }, deps());

    expect(result).toEqual({ status: 200, body: { ok: true, resultado: 'payload_invalido' } });
  });
});
