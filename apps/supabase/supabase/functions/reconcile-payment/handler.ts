import type { AsaasPayment, AsaasResult } from '../_shared/asaas.ts';
import type { PaymentEventInput } from '../asaas-payment-webhook/handler.ts';

export interface ReconcileDeps {
  attempts: {
    getById(id: string): Promise<{ id: string; paymentId: string | null } | null>;
    bindPaymentId(attemptId: string, paymentId: string): Promise<{ bound: boolean }>;
  };
  gateway: {
    getPayment(id: string): Promise<AsaasResult<AsaasPayment>>;
    listPayments(reference: string): Promise<AsaasResult<{ data: AsaasPayment[]; hasMore: boolean }>>;
  };
  events: {
    processPaymentEvent(input: PaymentEventInput): Promise<{ resultado: string; pedidoId: string | null }>;
  };
  cardSave: {
    // Reconciliation has authoritatively confirmed the charge but, after a
    // lost create response, there is no recoverable token to persist.
    markNotSaved(attemptId: string): Promise<void>;
  };
}

export async function handleReconcilePayment(
  input: { attemptId: string }, deps: ReconcileDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const attempt = await deps.attempts.getById(input.attemptId);
  if (!attempt) {
    return { status: 404, body: { ok: false, error: { code: 'TENTATIVA_NAO_ENCONTRADA', message: 'Tentativa não encontrada.' } } };
  }

  let charge: AsaasPayment | null = null;
  if (attempt.paymentId) {
    const result = await deps.gateway.getPayment(attempt.paymentId);
    if (!result.ok) return inconclusive();
    charge = result.data;
  } else {
    const result = await deps.gateway.listPayments(attempt.id);
    if (!result.ok) return inconclusive();
    if (result.data.hasMore || result.data.data.length > 1) {
      return conflict('COBRANCA_AMBIGUA', 'Mais de uma cobrança corresponde à tentativa.');
    }
    if (result.data.data.length === 0) {
      return conflict('COBRANCA_NAO_LOCALIZADA', 'Nenhuma cobrança foi localizada no gateway.');
    }
    charge = result.data.data[0] ?? null;
    if (!charge || typeof charge.id !== 'string' || charge.id.length === 0) return inconclusive();
    if (charge.externalReference !== attempt.id) {
      return conflict('VINCULO_DIVERGENTE', 'A cobrança localizada não pertence à tentativa consultada.');
    }
    const binding = await deps.attempts.bindPaymentId(attempt.id, charge.id);
    if (!binding.bound) {
      return conflict('VINCULO_DIVERGENTE', 'A tentativa já está vinculada a outra cobrança.');
    }
  }

  if (!charge || typeof charge.id !== 'string' || typeof charge.status !== 'string') return inconclusive();
  const valueCents = Number.isFinite(charge.value) ? Math.round(charge.value * 100) : null;
  const method = charge.billingType === 'PIX' ? 'pix' : charge.billingType === 'CREDIT_CARD' ? 'cartao' : null;
  const event = paymentEventForStatus(charge.status);
  const processed = await deps.events.processPaymentEvent({
    eventId: `reconcile:${attempt.id}:${charge.id}:${charge.status}`,
    event,
    paymentId: charge.id,
    reference: charge.externalReference ?? null,
    valueCents,
    method,
  });
  if (method === 'cartao' && (processed.resultado === 'recebido' || processed.resultado === 'confirmado')) {
    await deps.cardSave.markNotSaved(attempt.id);
  }
  return { status: 200, body: { ok: true, resultado: processed.resultado, pedido_id: processed.pedidoId } };
}

function paymentEventForStatus(status: string): string {
  const known: Record<string, string> = {
    RECEIVED: 'PAYMENT_RECEIVED',
    CONFIRMED: 'PAYMENT_CONFIRMED',
    AWAITING_RISK_ANALYSIS: 'PAYMENT_AWAITING_RISK_ANALYSIS',
    PENDING: 'PAYMENT_UPDATED',
    CREDIT_CARD_CAPTURE_REFUSED: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
    OVERDUE: 'PAYMENT_OVERDUE',
    REFUNDED: 'PAYMENT_REFUNDED',
    PARTIALLY_REFUNDED: 'PAYMENT_PARTIALLY_REFUNDED',
    REFUND_IN_PROGRESS: 'PAYMENT_REFUND_IN_PROGRESS',
  };
  return known[status] ?? `PAYMENT_RECONCILIATION_${status}`;
}

function inconclusive() {
  return {
    status: 503,
    body: { ok: false, error: { code: 'RECONCILIACAO_INCONCLUSA', message: 'Não foi possível confirmar o estado no gateway.' } },
  };
}

function conflict(code: string, message: string) {
  return { status: 409, body: { ok: false, error: { code, message } } };
}

export function createReconcileHttpHandler(deps: {
  authenticateAdmin(token: string): Promise<{ authenticated: boolean; adminId: string | null }>;
  createDeps(): ReconcileDeps;
}) {
  return async (request: Request): Promise<Response> => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') return json(405, { error: { code: 'METODO_INVALIDO' } });
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return json(401, { error: { code: 'AUTENTICACAO_NECESSARIA' } });
    }
    try {
      const auth = await deps.authenticateAdmin(authorization.slice(7));
      if (!auth.authenticated) return json(401, { error: { code: 'AUTENTICACAO_NECESSARIA' } });
      if (!auth.adminId) return json(403, { error: { code: 'ACESSO_NEGADO' } });

      let body: unknown;
      try { body = await request.json(); } catch { return json(400, { error: { code: 'BODY_INVALIDO' } }); }
      const object = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
      const attemptId = object?.tentativaId;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!object || Object.keys(object).length !== 1 || typeof attemptId !== 'string' || !uuid.test(attemptId)) {
        return json(400, { error: { code: 'ENTRADA_INVALIDA' } });
      }

      // O client privilegiado só é construído depois de autenticação e autorização Admin.
      const result = await handleReconcilePayment({ attemptId }, deps.createDeps());
      return json(result.status, result.body);
    } catch {
      return json(503, { error: { code: 'RECONCILIACAO_INCONCLUSA', message: 'Não foi possível confirmar o estado no gateway.' } });
    }
  };
}
