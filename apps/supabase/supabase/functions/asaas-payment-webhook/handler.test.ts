import { describe, expect, it, vi } from 'vitest';

import { handleAsaasWebhook } from './handler';
import type { WebhookAsaasDeps } from './handler';

const TOKEN = 'segredo-webhook-asaas';

function dependencies() {
  const processCardValidationEvent = vi.fn(async (): Promise<{ handled: boolean; operacaoId: string | null }> => (
    { handled: false, operacaoId: null }
  ));
  const processPaymentEvent = vi.fn(async (): Promise<{ resultado: string; pedidoId: string | null }> => (
    { resultado: 'confirmado', pedidoId: 'pedido-1' }
  ));
  const processAnticipationEvent = vi.fn(async (): Promise<{ resultado: string; pedidoId: string | null }> => (
    { resultado: 'antecipacao_atualizada', pedidoId: 'pedido-1' }
  ));
  const processRefundEvent = vi.fn(async (): Promise<{ resultado: string; pedidoId: string | null }> => (
    { resultado: 'reembolso_conciliado', pedidoId: 'pedido-1' }
  ));
  const value = {
    webhookToken: TOKEN,
    pagamentos: { processPaymentEvent, processAnticipationEvent, processRefundEvent, processCardValidationEvent },
  } as unknown as WebhookAsaasDeps;
  return { value, processPaymentEvent, processAnticipationEvent, processRefundEvent, processCardValidationEvent };
}

const paymentPayload = (event: string, overrides: Record<string, unknown> = {}) => ({
  id: 'evt-payment-1',
  event,
  payment: {
    id: 'pay-1',
    externalReference: 'tentativa-1',
    value: 107.9,
    billingType: 'CREDIT_CARD',
    ...overrides,
  },
});

describe('handleAsaasWebhook', () => {
  it('handles a card-validation event before the order refund branch', async () => {
    const deps = dependencies();
    deps.processCardValidationEvent.mockResolvedValueOnce({ handled: true, operacaoId: 'validation-1' });

    const result = await handleAsaasWebhook({ headerToken: TOKEN, body: {
      ...paymentPayload('PAYMENT_REFUND_DENIED', { externalReference: 'card-validation:validation-1' }),
      payment: { ...paymentPayload('PAYMENT_REFUND_DENIED').payment, externalReference: 'card-validation:validation-1', refunds: [{ id: 'refund-1', value: 10.79 }] },
    } }, deps.value);

    expect(result).toEqual({ status: 200, body: { ok: true, resultado: 'validacao_cartao_processada', pedido_id: null } });
    expect(deps.processRefundEvent).not.toHaveBeenCalled();
    expect(deps.processPaymentEvent).not.toHaveBeenCalled();
  });
  it('concilia cada estorno identificado com valor próprio sem usar o total da cobrança', async () => {
    const deps = dependencies();
    const result = await handleAsaasWebhook({ headerToken: TOKEN, body: {
      ...paymentPayload('PAYMENT_PARTIALLY_REFUNDED'),
      payment: { ...paymentPayload('PAYMENT_PARTIALLY_REFUNDED').payment,
        refunds: [{ id: 'ref-1', value: 5 }, { id: 'ref-2', value: 2.5 }] },
    } }, deps.value);
    expect(result.status).toBe(200);
    expect(deps.processRefundEvent).toHaveBeenCalledTimes(2);
    expect(deps.processRefundEvent).toHaveBeenCalledWith({
      eventId: 'evt-payment-1:ref-1', event: 'PAYMENT_PARTIALLY_REFUNDED',
      paymentId: 'pay-1', reference: 'tentativa-1', method: 'cartao',
      refundId: 'ref-1', valueCents: 500,
    });
    expect(deps.processPaymentEvent).not.toHaveBeenCalled();
  });

  it('rejeita token inválido antes de qualquer acesso ao repositório', async () => {
    const deps = dependencies();
    const result = await handleAsaasWebhook(
      { headerToken: 'incorreto', body: paymentPayload('PAYMENT_RECEIVED') }, deps.value,
    );
    expect(result.status).toBe(401);
    expect(deps.processPaymentEvent).not.toHaveBeenCalled();
    expect(deps.processAnticipationEvent).not.toHaveBeenCalled();
  });

  it.each(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_AWAITING_RISK_ANALYSIS'])(
    'encaminha %s com id do evento e conteúdo financeiro normalizado', async (event) => {
      const deps = dependencies();
      const result = await handleAsaasWebhook(
        { headerToken: TOKEN, body: paymentPayload(event) }, deps.value,
      );
      expect(result.status).toBe(200);
      expect(deps.processPaymentEvent).toHaveBeenCalledWith({
        eventId: 'evt-payment-1', event, paymentId: 'pay-1', reference: 'tentativa-1',
        valueCents: 10_790, method: 'cartao',
      });
    },
  );

  it.each(['PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED'])(
    'encaminha %s ao mesmo processador auditável sem caminho de débito paralelo', async (event) => {
      const deps = dependencies();
      await handleAsaasWebhook({ headerToken: TOKEN, body: paymentPayload(event) }, deps.value);
      expect(deps.processPaymentEvent).toHaveBeenCalledOnce();
    },
  );

  it('persiste evento PAYMENT desconhecido para diagnóstico', async () => {
    const deps = dependencies();
    await handleAsaasWebhook(
      { headerToken: TOKEN, body: paymentPayload('PAYMENT_FUTURE_EVENT') }, deps.value,
    );
    expect(deps.processPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'evt-payment-1', event: 'PAYMENT_FUTURE_EVENT',
    }));
  });

  it('persiste evento de família desconhecida para diagnóstico', async () => {
    const deps = dependencies();
    await handleAsaasWebhook(
      { headerToken: TOKEN, body: { id: 'evt-futuro', event: 'FUTURE_FINANCIAL_EVENT' } }, deps.value,
    );
    expect(deps.processPaymentEvent).toHaveBeenCalledWith({
      eventId: 'evt-futuro', event: 'FUTURE_FINANCIAL_EVENT', paymentId: null,
      reference: null, valueCents: null, method: null,
    });
  });

  it('rejeita evento de pagamento sem identificador durável antes do banco', async () => {
    const deps = dependencies();
    const result = await handleAsaasWebhook(
      { headerToken: TOKEN, body: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay-1' } } }, deps.value,
    );
    expect(result).toEqual({ status: 200, body: { ok: true, resultado: 'payload_invalido' } });
    expect(deps.processPaymentEvent).not.toHaveBeenCalled();
  });

  it('retorna falha recuperável e não vaza a mensagem interna do banco', async () => {
    const deps = dependencies();
    deps.processPaymentEvent.mockRejectedValueOnce(new Error('postgres password=segredo-super-secreto'));
    const result = await handleAsaasWebhook(
      { headerToken: TOKEN, body: paymentPayload('PAYMENT_RECEIVED') }, deps.value,
    );
    expect(result).toEqual({
      status: 502,
      body: { ok: false, error: { code: 'PROCESSAMENTO_FALHOU', message: 'Evento não persistido. Tente novamente.' } },
    });
    expect(JSON.stringify(result)).not.toContain('segredo-super-secreto');
  });

  it('pede reentrega quando o recibo aguarda a persistência do ID externo', async () => {
    const deps = dependencies();
    deps.processPaymentEvent.mockResolvedValueOnce({ resultado: 'aguardando_vinculo', pedidoId: null });
    const result = await handleAsaasWebhook(
      { headerToken: TOKEN, body: paymentPayload('PAYMENT_RECEIVED') }, deps.value,
    );
    expect(result).toEqual({
      status: 502,
      body: {
        ok: false,
        error: { code: 'VINCULO_PENDENTE', message: 'Cobrança ainda não vinculada. Tente novamente.' },
      },
    });
  });

  it.each([
    ['RECEIVABLE_ANTICIPATION_PENDING', 'PENDING'],
    ['RECEIVABLE_ANTICIPATION_CREDITED', 'CREDITED'],
    ['RECEIVABLE_ANTICIPATION_DENIED', 'DENIED'],
  ])('normaliza %s e valores da antecipação em centavos', async (event, status) => {
    const deps = dependencies();
    const result = await handleAsaasWebhook({
      headerToken: TOKEN,
      body: {
        id: `evt-${status}`, event,
        anticipation: {
          id: 'ant-1', payment: 'pay-1', status, totalValue: 310, fee: 5.64,
          netValue: 302.37, anticipationDate: '2026-10-02',
          denialObservation: status === 'DENIED' ? 'limite indisponível' : null,
        },
      },
    }, deps.value);
    expect(result.status).toBe(200);
    expect(deps.processAnticipationEvent).toHaveBeenCalledWith({
      eventId: `evt-${status}`, event, anticipationId: 'ant-1', paymentId: 'pay-1', status,
      grossValueCents: 31_000, feeCents: 564, netValueCents: 30_237,
      creditDate: '2026-10-02', denialReason: status === 'DENIED' ? 'limite indisponível' : null,
    });
  });

  it('não trata antecipação como confirmação do pedido', async () => {
    const deps = dependencies();
    await handleAsaasWebhook({
      headerToken: TOKEN,
      body: {
        id: 'evt-ant', event: 'RECEIVABLE_ANTICIPATION_CREDITED',
        anticipation: { id: 'ant-1', payment: 'pay-1', status: 'CREDITED', totalValue: 10, fee: 1, netValue: 9 },
      },
    }, deps.value);
    expect(deps.processPaymentEvent).not.toHaveBeenCalled();
    expect(deps.processAnticipationEvent).toHaveBeenCalledOnce();
  });
});
