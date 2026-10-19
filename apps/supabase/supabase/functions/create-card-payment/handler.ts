import type { AsaasClient, AsaasCardInput, AsaasHolderInput } from '../_shared/asaas.ts';
import { publicPaymentAttempt, type PaymentAttempt } from '../_shared/payment-attempt.ts';
import { createPaymentHttpHandler } from '../_shared/payment-http.ts';
import { cardTokenizationDisabled } from '../_shared/card-tokenization.ts';
import { getOrCreateCardCustomer, type CardEnvironment } from '../_shared/card-customer.ts';
import type { CardPurchaseRepository } from '../_shared/card-repository.ts';
import type { PedidosRepo } from '../create-pix-payment/handler.ts';

type CardPaymentInput = {
  pedido_id: string; operacao_id: string; usuario_id: string; remoteIp: string;
} & ({ cartao: AsaasCardInput; titular: AsaasHolderInput; salvar_cartao?: boolean; cartao_salvo_id?: never }
  | { cartao_salvo_id: string; cartao?: never; titular?: never; salvar_cartao?: never });
interface CardDeps { asaasClient: AsaasClient; pedidos: PedidosRepo; cards: CardPurchaseRepository; ambiente?: CardEnvironment; now?: () => Date; enabled?: boolean }
type Result = { ok: true; data: { tentativa: PaymentAttempt } }
  | { ok: false; error: { status: number; code: string; message: string } };
const failure = (status: number, code: string, message: string): Result => ({ ok: false, error: { status, code, message } });
const reconciliation = () => failure(409, 'PAGAMENTO_RECONCILIACAO', 'Aguarde a conciliação antes de pagar novamente.');
const rejected = () => failure(422, 'PAGAMENTO_RECUSADO', 'Cartão recusado. Revise os dados ou use outro cartão.');
const unavailable = () => failure(409, 'CARTAO_INDISPONIVEL', 'Este cartão não está disponível. Escolha outra forma de pagamento.');
const invalidToken = () => failure(422, 'CARTAO_TOKEN_INVALIDO', 'Este cartão não está mais disponível e foi removido. Escolha outra forma de pagamento.');
const definitive = (status: number) => status >= 400 && status < 500 && ![408, 429].includes(status);

export async function handleCreateCardPayment(input: CardPaymentInput, deps: CardDeps): Promise<Result> {
  if (deps.enabled !== true && ('cartao_salvo_id' in input || input.salvar_cartao === true)) {
    const disabled = cardTokenizationDisabled();
    return failure(disabled.status, disabled.body.error.code, disabled.body.error.message);
  }
  const pedido = await deps.pedidos.getById(input.pedido_id);
  if (!pedido) return failure(404, 'PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.');
  if (!input.usuario_id || pedido.cliente_id !== input.usuario_id) return failure(403, 'ACESSO_NEGADO', 'Pedido não pertence à sessão.');
  if (pedido.status !== 'aguardando_pagamento' || pedido.pago_em) return failure(409, 'PEDIDO_NAO_PAGAVEL', 'Pedido não está aguardando pagamento.');
  if (!pedido.snapshot_valido || !Number.isSafeInteger(pedido.total_centavos) || pedido.total_centavos! <= 0
    || Math.round(pedido.total_pago_reais * 100) !== pedido.total_centavos) return failure(409, 'SNAPSHOT_INVALIDO', 'Pedido sem cotação válida.');
  if (!pedido.cliente_cpf) return failure(422, 'CLIENTE_SEM_CPF', 'Cadastre seu CPF para pagar.');
  let claim: Awaited<ReturnType<PedidosRepo['claim']>>;
  try { claim = await deps.pedidos.claim(pedido.id, input.operacao_id); }
  catch { return reconciliation(); }
  let attempt = claim.attempt;
  const savedCardId = 'cartao_salvo_id' in input && typeof input.cartao_salvo_id === 'string' ? input.cartao_salvo_id : null;
  const salvarCartao = savedCardId === null && input.salvar_cartao === true;
  let chargeStarted = false;
  let chargeResponseReceived = false;
  if (attempt.estado === 'reconciliacao') return reconciliation();
  if (attempt.estado === 'recusado' || attempt.estado === 'expirado') return rejected();
  if (attempt.asaas_payment_id) return { ok: true, data: { tentativa: publicPaymentAttempt(attempt) } };
  if (!claim.acquired) return reconciliation();
  try {
    const ambiente = deps.ambiente ?? 'sandbox';
    try {
      await deps.cards.registrarCompra({ clienteId: pedido.cliente_id, tentativaId: attempt.id, operacaoId: input.operacao_id,
        ambiente, salvarCartao, cartaoSalvoId: savedCardId });
    } catch {
      if (!savedCardId) throw new Error('OPERACAO_CARTAO_INDISPONIVEL');
      try { await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: 'recusado' }); }
      catch { return reconciliation(); }
      return unavailable();
    }
    let customerId: string;
    let creditCard: AsaasCardInput | undefined;
    let creditCardHolderInfo: AsaasHolderInput | undefined;
    let creditCardToken: string | undefined;
    if (savedCardId) {
      try {
        const saved = await deps.cards.obterCartao({ clienteId: pedido.cliente_id, cartaoId: savedCardId, ambiente });
        customerId = saved.customerId;
        creditCardToken = saved.token;
      } catch {
        await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: 'recusado' });
        return unavailable();
      }
    } else {
      const customer = await getOrCreateCardCustomer({ clienteId: pedido.cliente_id, ambiente,
        store: deps.cards.customerStore, asaas: deps.asaasClient });
      if (!customer.ok) {
        await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: 'reconciliacao' });
        return reconciliation();
      }
      customerId = customer.customerId;
      creditCard = input.cartao;
      creditCardHolderInfo = input.titular;
    }
    chargeStarted = true;
    const charge = await deps.asaasClient.criarCobranca({
      customer: customerId, billingType: 'CREDIT_CARD', value: pedido.total_centavos! / 100,
      dueDate: (deps.now?.() ?? new Date()).toISOString().slice(0, 10), externalReference: attempt.id,
      ...(creditCardToken ? { creditCardToken } : { creditCard: creditCard!, creditCardHolderInfo: creditCardHolderInfo! }), remoteIp: input.remoteIp,
    });
    chargeResponseReceived = true;
    if (!charge.ok) {
      if (savedCardId && charge.error.cardFailure?.categoria === 'token_invalido') {
        try {
          await deps.cards.invalidarCartao({ clienteId: pedido.cliente_id, cartaoId: savedCardId, operacaoId: input.operacao_id });
          return invalidToken();
        } catch {
          await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: 'reconciliacao' });
          return reconciliation();
        }
      }
      if (charge.error.cardFailure?.categoria === 'indisponivel') {
        await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: 'recusado' });
        return unavailable();
      }
      if (!definitive(charge.error.status) && salvarCartao) {
        try { await deps.cards.marcarRespostaCobrancaPerdida({ operacaoId: input.operacao_id }); } catch { /* reconciliation remains safe */ }
      }
      await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: definitive(charge.error.status) ? 'recusado' : 'reconciliacao' });
      return definitive(charge.error.status) ? rejected() : reconciliation();
    }
    const known = ['CONFIRMED', 'RECEIVED', 'PENDING', 'AWAITING_RISK_ANALYSIS'].includes(charge.data.status);
    // O webhook/reconciliador confirma atomicamente tentativa + pedido. A criação não libera PIN.
    attempt = await deps.pedidos.save(attempt.id, attempt.claim_token, {
      asaas_payment_id: charge.data.id, estado: known ? 'pendente' : 'reconciliacao',
    });
    let avisoCartao: 'nao_salvo' | undefined;
    if (known && salvarCartao) {
      try {
        const metadata = charge.data.cardTokenMetadata;
        if (!metadata) throw new Error('METADADOS_AUSENTES');
        const operation = await deps.cards.salvarTokenCompra({ operacaoId: input.operacao_id, customerId,
          token: metadata.token, bandeira: metadata.bandeira, ultimo4: metadata.ultimo4 });
        if (operation.avisoCodigo === 'nao_salvo') avisoCartao = 'nao_salvo';
      } catch {
        try {
          const operation = await deps.cards.marcarNaoSalvo({ operacaoId: input.operacao_id });
          if (operation.avisoCodigo === 'nao_salvo') avisoCartao = 'nao_salvo';
        } catch {
          // The charge ID is already persisted. Preserve the financial result;
          // a later query can distinguish an unavailable card save from payment.
          avisoCartao = 'nao_salvo';
        }
      }
    }
    return known ? { ok: true, data: { tentativa: publicPaymentAttempt(attempt, avisoCartao) } } : reconciliation();
  } catch {
    if (chargeStarted && !chargeResponseReceived && salvarCartao) {
      try { await deps.cards.marcarRespostaCobrancaPerdida({ operacaoId: input.operacao_id }); } catch { /* reconciliation remains safe */ }
    }
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
  if (Object.keys(body).every((key) => ['pedido_id', 'operacao_id', 'cartao_salvo_id'].includes(key))) {
    return exactStrings(body, ['pedido_id', 'operacao_id', 'cartao_salvo_id']);
  }
  if (Object.keys(body).some((key) => !['pedido_id', 'operacao_id', 'cartao', 'titular', 'salvar_cartao'].includes(key))) return false;
  if (body.salvar_cartao !== undefined && typeof body.salvar_cartao !== 'boolean') return false;
  const c = body.cartao; const h = body.titular;
  return exactStrings(c, ['holderName', 'number', 'expiryMonth', 'expiryYear', 'ccv'])
    && /^\d{13,19}$/.test(c.number) && /^(0[1-9]|1[0-2])$/.test(c.expiryMonth) && /^20\d{2}$/.test(c.expiryYear) && /^\d{3,4}$/.test(c.ccv)
    && exactStrings(h, ['name', 'email', 'cpfCnpj', 'postalCode', 'addressNumber', 'phone'])
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email) && /^(\d{11}|\d{14})$/.test(h.cpfCnpj) && /^\d{8}$/.test(h.postalCode) && /^\d{10,13}$/.test(h.phone);
}

/** O Supabase Edge Gateway fornece o IP do cliente neste header confiável. */
export function trustedPayerIp(req: Request): string | null {
  const ip = req.headers.get('cf-connecting-ip') ?? '';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip.split('.').every((part) => Number(part) <= 255) ? ip : null;
  if (ip.includes(':')) {
    try { new URL(`http://[${ip}]/`); return ip; } catch { return null; }
  }
  return null;
}
export function createCardHttpHandler(deps: {
  allowedOrigins: string[]; authenticate(token: string): Promise<string | null>;
  authorizeOrder(token: string, pedidoId: string, usuarioId: string): Promise<boolean>;
  trustedIp(req: Request): string | null; createDeps(token: string): CardDeps; enabled?: boolean;
}) {
  return createPaymentHttpHandler({
    idField: 'pedido_id', allowedOrigins: deps.allowedOrigins, authenticate: deps.authenticate,
    validateBody: validCardBody,
    async execute(pedidoId, operacaoId, usuarioId, token, body, req) {
      if (!await deps.authorizeOrder(token, pedidoId, usuarioId)) {
        return { status: 403, body: { error: { code: 'ACESSO_NEGADO', message: 'Pedido indisponível para pagamento.' } } };
      }
      if (deps.enabled !== true && ('cartao_salvo_id' in body || body.salvar_cartao === true)) return cardTokenizationDisabled();
      const remoteIp = deps.trustedIp(req);
      if (!remoteIp) return { status: 503, body: { error: { code: 'IP_PAGADOR_INDISPONIVEL', message: 'Pagamento com cartão temporariamente indisponível.' } } };
      const result = await handleCreateCardPayment({ pedido_id: pedidoId, operacao_id: operacaoId, usuario_id: usuarioId,
        ...('cartao_salvo_id' in body
          ? { cartao_salvo_id: body.cartao_salvo_id as string }
          : { cartao: body.cartao as AsaasCardInput, titular: body.titular as AsaasHolderInput, salvar_cartao: body.salvar_cartao as boolean | undefined }),
        remoteIp }, deps.createDeps(token));
      return result.ok ? { status: 200, body: result.data } : { status: result.error.status, body: { error: result.error } };
    },
  });
}
