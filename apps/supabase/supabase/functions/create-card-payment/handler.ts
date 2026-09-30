import type { AsaasClient, AsaasCardInput, AsaasHolderInput } from '../_shared/asaas.ts';
import { publicPaymentAttempt, type PaymentAttempt } from '../_shared/payment-attempt.ts';
import { createPaymentHttpHandler } from '../_shared/payment-http.ts';
import type { PedidosRepo } from '../create-pix-payment/handler.ts';

interface CardPaymentInput {
  pedido_id: string; operacao_id: string; usuario_id: string;
  cartao: AsaasCardInput; titular: AsaasHolderInput; remoteIp: string;
}
interface CardDeps { asaasClient: AsaasClient; pedidos: PedidosRepo; now?: () => Date }
type Result = { ok: true; data: { tentativa: PaymentAttempt } }
  | { ok: false; error: { status: number; code: string; message: string } };
const failure = (status: number, code: string, message: string): Result => ({ ok: false, error: { status, code, message } });
const reconciliation = () => failure(409, 'PAGAMENTO_RECONCILIACAO', 'Aguarde a conciliação antes de pagar novamente.');
const rejected = () => failure(422, 'PAGAMENTO_RECUSADO', 'Cartão recusado. Revise os dados ou use outro cartão.');
const definitive = (status: number) => status >= 400 && status < 500 && ![408, 429].includes(status);

export async function handleCreateCardPayment(input: CardPaymentInput, deps: CardDeps): Promise<Result> {
  const pedido = await deps.pedidos.getById(input.pedido_id);
  if (!pedido) return failure(404, 'PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.');
  if (!input.usuario_id || pedido.cliente_id !== input.usuario_id) return failure(403, 'ACESSO_NEGADO', 'Pedido não pertence à sessão.');
  if (pedido.status !== 'aguardando_pagamento' || pedido.pago_em) return failure(409, 'PEDIDO_NAO_PAGAVEL', 'Pedido não está aguardando pagamento.');
  if (pedido.forma_pagamento !== 'cartao') return failure(409, 'FORMA_DIVERGENTE', 'Método de pagamento divergente.');
  if (!pedido.snapshot_valido || !Number.isSafeInteger(pedido.total_centavos) || pedido.total_centavos! <= 0
    || Math.round(pedido.total_pago_reais * 100) !== pedido.total_centavos) return failure(409, 'SNAPSHOT_INVALIDO', 'Pedido sem cotação válida.');
  if (!pedido.cliente_cpf) return failure(422, 'CLIENTE_SEM_CPF', 'Cadastre seu CPF para pagar.');
  let claim: Awaited<ReturnType<PedidosRepo['claim']>>;
  try { claim = await deps.pedidos.claim(pedido.id, input.operacao_id); }
  catch { return reconciliation(); }
  let attempt = claim.attempt;
  if (attempt.estado === 'reconciliacao') return reconciliation();
  if (attempt.estado === 'recusado' || attempt.estado === 'expirado') return rejected();
  if (attempt.asaas_payment_id) return { ok: true, data: { tentativa: publicPaymentAttempt(attempt) } };
  if (!claim.acquired) return reconciliation();
  try {
    const customer = await deps.asaasClient.criarCliente({ name: pedido.cliente_nome, cpfCnpj: pedido.cliente_cpf, externalReference: pedido.cliente_id });
    if (!customer.ok) {
      await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: definitive(customer.error.status) ? 'recusado' : 'reconciliacao' });
      return definitive(customer.error.status) ? rejected() : reconciliation();
    }
    const charge = await deps.asaasClient.criarCobranca({
      customer: customer.data.id, billingType: 'CREDIT_CARD', value: pedido.total_centavos! / 100,
      dueDate: (deps.now?.() ?? new Date()).toISOString().slice(0, 10), externalReference: attempt.id,
      creditCard: input.cartao, creditCardHolderInfo: input.titular, remoteIp: input.remoteIp,
    });
    if (!charge.ok) {
      await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: definitive(charge.error.status) ? 'recusado' : 'reconciliacao' });
      return definitive(charge.error.status) ? rejected() : reconciliation();
    }
    const known = ['CONFIRMED', 'RECEIVED', 'PENDING', 'AWAITING_RISK_ANALYSIS'].includes(charge.data.status);
    // O webhook/reconciliador confirma atomicamente tentativa + pedido. A criação não libera PIN.
    attempt = await deps.pedidos.save(attempt.id, attempt.claim_token, {
      asaas_payment_id: charge.data.id, estado: known ? 'pendente' : 'reconciliacao',
    });
    return known ? { ok: true, data: { tentativa: publicPaymentAttempt(attempt) } } : reconciliation();
  } catch {
    try { await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: 'reconciliacao' }); } catch { /* claim durável bloqueia duplicação */ }
    return reconciliation();
  }
}

function exactStrings(value: unknown, fields: string[]): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return Object.keys(object).length === fields.length && fields.every((key) => typeof object[key] === 'string' && (object[key] as string).trim().length > 0 && (object[key] as string).length <= 150);
}
function validCardBody(body: Record<string, unknown>): boolean {
  if (Object.keys(body).some((key) => !['pedido_id', 'operacao_id', 'cartao', 'titular'].includes(key))) return false;
  const c = body.cartao; const h = body.titular;
  return exactStrings(c, ['holderName', 'number', 'expiryMonth', 'expiryYear', 'ccv'])
    && /^\d{13,19}$/.test(c.number) && /^(0[1-9]|1[0-2])$/.test(c.expiryMonth) && /^20\d{2}$/.test(c.expiryYear) && /^\d{3,4}$/.test(c.ccv)
    && exactStrings(h, ['name', 'email', 'cpfCnpj', 'postalCode', 'addressNumber', 'phone'])
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email) && /^(\d{11}|\d{14})$/.test(h.cpfCnpj) && /^\d{8}$/.test(h.postalCode) && /^\d{10,13}$/.test(h.phone);
}

/** O proxy remove headers do cliente e injeta estes dois valores server-side via TLS.
 * Nunca configurar este segredo no app. Sem proxy autenticado, cartão falha fechado.
 */
export function trustedPayerIp(req: Request, secret?: string): string | null {
  if (!secret || req.headers.get('x-payment-proxy-token') !== secret) return null;
  const ip = req.headers.get('x-payment-client-ip') ?? '';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip.split('.').every((part) => Number(part) <= 255) ? ip : null;
  if (/^[\da-f:]+$/i.test(ip) && ip.includes(':')) {
    try { new URL(`http://[${ip}]/`); return ip; } catch { return null; }
  }
  return null;
}
export function createCardHttpHandler(deps: {
  allowedOrigins: string[]; authenticate(token: string): Promise<string | null>;
  trustedIp(req: Request): string | null; createDeps(token: string): CardDeps;
}) {
  return createPaymentHttpHandler({
    idField: 'pedido_id', allowedOrigins: deps.allowedOrigins, authenticate: deps.authenticate,
    validateBody: validCardBody,
    async execute(pedidoId, operacaoId, usuarioId, token, body, req) {
      const remoteIp = deps.trustedIp(req);
      if (!remoteIp) return { status: 503, body: { error: { code: 'IP_PAGADOR_INDISPONIVEL', message: 'Pagamento com cartão temporariamente indisponível.' } } };
      const result = await handleCreateCardPayment({ pedido_id: pedidoId, operacao_id: operacaoId, usuario_id: usuarioId,
        cartao: body.cartao as AsaasCardInput, titular: body.titular as AsaasHolderInput, remoteIp }, deps.createDeps(token));
      return result.ok ? { status: 200, body: result.data } : { status: result.error.status, body: { error: result.error } };
    },
  });
}
