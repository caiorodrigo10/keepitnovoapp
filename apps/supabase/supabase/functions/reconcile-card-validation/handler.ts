import { advanceCardValidation, type CardValidationDeps } from '../_shared/card-validation.ts';
import { cardTokenizationDisabled } from '../_shared/card-tokenization.ts';

export interface ReconcileCardValidationDeps extends CardValidationDeps {}

export async function handleReconcileCardValidation(
  input: { operacaoId: string }, deps: ReconcileCardValidationDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const operation = await deps.cards.get(input.operacaoId);
  if (!operation) return { status: 404, body: { ok: false, error: { code: 'OPERACAO_NAO_ENCONTRADA' } } };
  if (['concluida', 'recusada'].includes(operation.estado)) {
    return { status: 200, body: { ok: true, id: operation.id, estado: operation.estado, valorCentavos: operation.valorCentavos } };
  }

  // A lost create response is recovered exclusively by GET/listing.  Empty,
  // ambiguous or paginated listings deliberately leave the durable operation
  // untouched: this runner never sends a new charge or tokenization POST.
  let payment;
  if (operation.cobrancaId) {
    const found = await deps.asaas.consultarCobranca(operation.cobrancaId);
    if (!found.ok) return { status: 503, body: { ok: false, error: { code: 'RECONCILIACAO_INCONCLUSA' } } };
    payment = found.data;
  } else {
    const found = await deps.asaas.listarCobrancasPorReferencia(`card-validation:${operation.id}`);
    if (!found.ok || found.data.hasMore || found.data.data.length !== 1) {
      return { status: 503, body: { ok: false, error: { code: 'RECONCILIACAO_INCONCLUSA' } } };
    }
    payment = found.data.data[0];
  }
  if (!payment || !operation.customerId || payment.customer !== operation.customerId
    || payment.externalReference !== `card-validation:${operation.id}`
    || payment.billingType !== 'CREDIT_CARD' || Math.round(payment.value * 100) !== operation.valorCentavos) {
    return { status: 409, body: { ok: false, error: { code: 'COBRANCA_DIVERGENTE' } } };
  }
  await deps.cards.reconcileCharge(operation.id, payment.id);

  // No cardholder data is available to the Admin runner.  It may only observe
  // gateway state and advance a stage that was already durably prepared.
  const result = await advanceCardValidation({
    clienteId: operation.clienteId,
    operationId: operation.id,
    remoteIp: '0.0.0.0',
    valorCentavos: operation.valorCentavos,
  }, deps);
  return { status: 200, body: { ok: true, ...result } };
}

export function createReconcileCardValidationHttpHandler(deps: {
  authenticateAdmin(token: string): Promise<{ authenticated: boolean; adminId: string | null }>;
  createDeps(): ReconcileCardValidationDeps;
  enabled?: boolean;
}) {
  return async (request: Request): Promise<Response> => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json(405, { error: { code: 'METODO_INVALIDO' } });
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: { code: 'AUTENTICACAO_NECESSARIA' } });
    try {
      const auth = await deps.authenticateAdmin(authorization.slice(7));
      if (!auth.authenticated) return json(401, { error: { code: 'AUTENTICACAO_NECESSARIA' } });
      if (!auth.adminId) return json(403, { error: { code: 'ACESSO_NEGADO' } });
      const body: unknown = await request.json().catch(() => null);
      const object = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
      const operacaoId = object?.operacaoId;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!object || Object.keys(object).length !== 1 || typeof operacaoId !== 'string' || !uuid.test(operacaoId)) {
        return json(400, { error: { code: 'ENTRADA_INVALIDA' } });
      }
      if (deps.enabled !== true) {
        const disabled = cardTokenizationDisabled();
        return json(disabled.status, disabled.body);
      }
      // Privileged dependencies only exist after the Admin boundary above.
      const result = await handleReconcileCardValidation({ operacaoId }, deps.createDeps());
      return json(result.status, result.body);
    } catch {
      return json(503, { error: { code: 'RECONCILIACAO_INCONCLUSA' } });
    }
  };
}
