import { createPaymentHttpHandler } from '../_shared/payment-http.ts';
import type { AsaasClient, AsaasPayment } from '../_shared/asaas.ts';
import { publicPaymentAttempt, type DurablePaymentAttempt, type PaymentAttempt } from '../_shared/payment-attempt.ts';

export interface ClosureClaim {
  attempt: DurablePaymentAttempt & { cliente_id: string };
  total_centavos: number;
  acquired: boolean;
  claim_token: string | null;
}
export interface ClosePaymentRepo {
  prepare(tentativaId: string, operacaoId: string, usuarioId: string): Promise<ClosureClaim>;
  complete(tentativaId: string, token: string, proof: AsaasPayment): Promise<PaymentAttempt>;
  uncertain(tentativaId: string, token: string): Promise<void>;
}
export type ClosePaymentResult = { ok: true; data: PaymentAttempt }
  | { ok: false; error: { status: number; code: string; message: string } };
const reconciliation = (): ClosePaymentResult => ({ ok: false, error: {
  status: 409, code: 'PAGAMENTO_RECONCILIACAO', message: 'Não foi possível confirmar o encerramento. Aguarde a conciliação antes de trocar o pagamento.',
} });

/** Encerramento explícito: consulta → exclusão → consulta → confirmação durável. */
export async function handleClosePaymentAttempt(
  input: { tentativa_id: string; operacao_id: string; usuario_id: string },
  deps: { repo: ClosePaymentRepo; asaasClient: AsaasClient },
): Promise<ClosePaymentResult> {
  let claim: ClosureClaim;
  try { claim = await deps.repo.prepare(input.tentativa_id, input.operacao_id, input.usuario_id); }
  catch { return reconciliation(); }
  const attempt = claim.attempt;
  if (!input.usuario_id || attempt.cliente_id !== input.usuario_id) return { ok: false, error: { status: 403, code: 'ACESSO_NEGADO', message: 'Tentativa não pertence à sessão.' } };
  if (attempt.estado === 'expirado' || attempt.estado === 'recusado') return { ok: true, data: publicPaymentAttempt(attempt) };
  if (!claim.acquired || !claim.claim_token) return reconciliation();
  const validUnpaid = (charge: AsaasPayment | undefined): charge is AsaasPayment => !!charge
    && typeof charge.id === 'string' && charge.id.length > 0
    && (!attempt.asaas_payment_id || charge.id === attempt.asaas_payment_id)
    && charge.externalReference === attempt.id
    && charge.billingType === (attempt.forma === 'pix' ? 'PIX' : 'CREDIT_CARD')
    && Number.isSafeInteger(claim.total_centavos) && claim.total_centavos > 0
    && Math.round(charge.value * 100) === claim.total_centavos
    && ['PENDING', 'OVERDUE'].includes(charge.status)
    && !charge.paymentDate && !charge.clientPaymentDate;
  try {
    let charge: AsaasPayment;
    if (attempt.asaas_payment_id) {
      const result = await deps.asaasClient.consultarCobranca(attempt.asaas_payment_id);
      if (!result.ok) throw new Error('CONSULTA_INCONCLUSIVA');
      charge = result.data;
    } else {
      const result = await deps.asaasClient.listarCobrancasPorReferencia(attempt.id);
      // Lista vazia/ambígua não prova que o POST anterior deixou de criar cobrança.
      if (!result.ok || result.data?.hasMore !== false || result.data.data?.length !== 1) throw new Error('CONSULTA_INCONCLUSIVA');
      charge = result.data.data[0];
    }
    if (!validUnpaid(charge)) throw new Error('COBRANCA_INCOMPATIVEL');
    if (charge.deleted !== true) {
      const removed = await deps.asaasClient.excluirCobranca(charge.id);
      if (!removed.ok || removed.data?.id !== charge.id || removed.data.deleted !== true) throw new Error('EXCLUSAO_INCONCLUSIVA');
      const verified = await deps.asaasClient.consultarCobranca(charge.id);
      if (!verified.ok || verified.data?.id !== charge.id || !validUnpaid(verified.data) || verified.data.deleted !== true) throw new Error('EXCLUSAO_INCONCLUSIVA');
      charge = verified.data;
    }
    // Persiste só a prova mínima, nunca dados completos do titular retornados pelo gateway.
    const proof: AsaasPayment = { id: charge.id, deleted: true, status: charge.status,
      value: charge.value, billingType: charge.billingType, externalReference: charge.externalReference };
    return { ok: true, data: await deps.repo.complete(attempt.id, claim.claim_token, proof) };
  } catch {
    try { await deps.repo.uncertain(attempt.id, claim.claim_token); } catch { /* Claim persistido continua bloqueando até nova consulta. */ }
    return reconciliation();
  }
}

export function createClosePaymentHttpHandler(deps: {
  allowedOrigins: string[];
  authenticate(token: string): Promise<string | null>;
  createDeps(token: string): { repo: ClosePaymentRepo; asaasClient: AsaasClient };
}) {
  return createPaymentHttpHandler({
    idField: 'tentativa_id', allowedOrigins: deps.allowedOrigins, authenticate: deps.authenticate,
    async execute(tentativaId, operacaoId, usuarioId, token) {
      const result = await handleClosePaymentAttempt({ tentativa_id: tentativaId, operacao_id: operacaoId, usuario_id: usuarioId }, deps.createDeps(token));
      return result.ok ? { status: 200, body: { tentativa: result.data } } : { status: result.error.status, body: { error: result.error } };
    },
  });
}
