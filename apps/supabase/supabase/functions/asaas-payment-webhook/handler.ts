export interface PaymentEventInput {
  eventId: string;
  event: string;
  paymentId: string | null;
  reference: string | null;
  valueCents: number | null;
  method: 'pix' | 'cartao' | null;
}

export interface RefundEventInput extends PaymentEventInput {
  refundId: string;
  valueCents: number;
}

export interface AnticipationEventInput {
  eventId: string;
  event: string;
  anticipationId: string;
  paymentId: string;
  status: string;
  grossValueCents: number;
  feeCents: number;
  netValueCents: number;
  creditDate: string | null;
  denialReason: string | null;
}

export interface PagamentosRepo {
  processPaymentEvent(input: PaymentEventInput): Promise<{ resultado: string; pedidoId: string | null }>;
  processRefundEvent(input: RefundEventInput): Promise<{ resultado: string; pedidoId: string | null }>;
  processAnticipationEvent(input: AnticipationEventInput): Promise<{ resultado: string; pedidoId: string | null }>;
}

export interface WebhookAsaasDeps {
  webhookToken: string;
  pagamentos: PagamentosRepo;
}

export interface WebhookAsaasInput {
  headerToken: string | null | undefined;
  body: unknown;
}

export type WebhookAsaasResult =
  | { status: 200; body: { ok: true; resultado: string; pedido_id?: string | null } }
  | { status: 401; body: { ok: false; error: { code: 'TOKEN_INVALIDO'; message: string } } }
  | { status: 502; body: { ok: false; error: { code: 'PROCESSAMENTO_FALHOU' | 'VINCULO_PENDENTE'; message: string } } };

function processedResponse(result: { resultado: string; pedidoId: string | null }): WebhookAsaasResult {
  if (result.resultado === 'aguardando_vinculo') {
    return {
      status: 502,
      body: {
        ok: false,
        error: { code: 'VINCULO_PENDENTE', message: 'Cobrança ainda não vinculada. Tente novamente.' },
      },
    };
  }
  return { status: 200, body: { ok: true, resultado: result.resultado, pedido_id: result.pedidoId } };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : nonEmptyString(value);
}

function cents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const normalized = Math.round(value * 100);
  return Number.isSafeInteger(normalized) ? normalized : null;
}

function paymentMethod(value: unknown): PaymentEventInput['method'] {
  if (value === 'PIX') return 'pix';
  if (value === 'CREDIT_CARD') return 'cartao';
  return null;
}

function parsePaymentEvent(body: Record<string, unknown>, eventId: string, event: string): PaymentEventInput | null {
  const payment = record(body.payment);
  if (!payment) return null;
  return {
    eventId,
    event,
    paymentId: optionalString(payment.id),
    reference: optionalString(payment.externalReference),
    valueCents: cents(payment.value),
    method: paymentMethod(payment.billingType),
  };
}

function parseRefundEvents(body: Record<string, unknown>, eventId: string, event: string): RefundEventInput[] | null {
  const payment = record(body.payment);
  if (!payment || !Array.isArray(payment.refunds) || payment.refunds.length === 0) return null;
  const base = parsePaymentEvent(body, eventId, event);
  if (!base) return null;
  const results: RefundEventInput[] = [];
  for (const value of payment.refunds) {
    const refund = record(value);
    const refundId = nonEmptyString(refund?.id);
    const valueCents = cents(refund?.value);
    if (!refundId || valueCents === null || valueCents === 0) return null;
    results.push({ ...base, eventId: `${eventId}:${refundId}`, refundId, valueCents });
  }
  return results;
}

function parseAnticipationEvent(
  body: Record<string, unknown>, eventId: string, event: string,
): AnticipationEventInput | null {
  const anticipation = record(body.anticipation);
  if (!anticipation) return null;
  const anticipationId = nonEmptyString(anticipation.id);
  const paymentId = nonEmptyString(anticipation.payment);
  const status = nonEmptyString(anticipation.status);
  const grossValueCents = cents(anticipation.totalValue);
  const feeCents = cents(anticipation.fee);
  const netValueCents = cents(anticipation.netValue);
  if (!anticipationId || !paymentId || !status || grossValueCents === null || feeCents === null || netValueCents === null) {
    return null;
  }
  return {
    eventId,
    event,
    anticipationId,
    paymentId,
    status,
    grossValueCents,
    feeCents,
    netValueCents,
    creditDate: optionalString(anticipation.anticipationDate),
    denialReason: optionalString(anticipation.denialObservation),
  };
}

export async function handleAsaasWebhook(
  input: WebhookAsaasInput,
  deps: WebhookAsaasDeps,
): Promise<WebhookAsaasResult> {
  // O segredo externo é validado antes de parse, log ou acesso ao banco.
  if (!deps.webhookToken || input.headerToken !== deps.webhookToken) {
    return {
      status: 401,
      body: { ok: false, error: { code: 'TOKEN_INVALIDO', message: 'Header asaas-access-token ausente ou inválido.' } },
    };
  }

  const body = record(input.body);
  const eventId = nonEmptyString(body?.id);
  const event = nonEmptyString(body?.event);
  if (!body || !eventId || !event) {
    return { status: 200, body: { ok: true, resultado: 'payload_invalido' } };
  }

  try {
    if (event.startsWith('RECEIVABLE_ANTICIPATION_')) {
      const parsed = parseAnticipationEvent(body, eventId, event);
      if (!parsed) return { status: 200, body: { ok: true, resultado: 'payload_invalido' } };
      const result = await deps.pagamentos.processAnticipationEvent(parsed);
      return processedResponse(result);
    }

    if (event.startsWith('PAYMENT_')) {
      if (['PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_REFUND_DENIED'].includes(event)) {
        const refunds = parseRefundEvents(body, eventId, event);
        if (refunds) {
          let result: { resultado: string; pedidoId: string | null } = { resultado: 'reembolso_conciliado', pedidoId: null };
          for (const refund of refunds) {
            result = await deps.pagamentos.processRefundEvent(refund);
            if (result.resultado === 'aguardando_vinculo') return processedResponse(result);
          }
          return processedResponse(result);
        }
      }
      const parsed = parsePaymentEvent(body, eventId, event);
      if (!parsed) return { status: 200, body: { ok: true, resultado: 'payload_invalido' } };
      const result = await deps.pagamentos.processPaymentEvent(parsed);
      return processedResponse(result);
    }

    // Uma família nova também ganha recibo durável. Campos de cobrança ficam
    // nulos e o processador a classifica para diagnóstico sem efeito financeiro.
    const result = await deps.pagamentos.processPaymentEvent({
      eventId,
      event,
      paymentId: null,
      reference: null,
      valueCents: null,
      method: null,
    });
    return processedResponse(result);
  } catch {
    // Não expõe mensagem do banco, payload ou segredo. 502 pede reentrega ao gateway.
    return {
      status: 502,
      body: { ok: false, error: { code: 'PROCESSAMENTO_FALHOU', message: 'Evento não persistido. Tente novamente.' } },
    };
  }
}
