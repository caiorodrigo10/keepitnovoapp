import type { AsaasClient } from '../_shared/asaas.ts';
import { publicPaymentAttempt } from '../_shared/payment-attempt.ts';
import type { DurablePaymentAttempt, PaymentAttempt } from '../_shared/payment-attempt.ts';

export interface PedidoParaCobranca {
  id: string; cliente_id: string; cliente_nome: string; cliente_cpf: string | null;
  status: string; forma_pagamento: string; pago_em: string | null;
  total_centavos: number | null; total_pago_reais: number; snapshot_valido: boolean;
}
export interface PedidosRepo {
  getById(pedidoId: string): Promise<PedidoParaCobranca | null>;
  claim(pedidoId: string, operacaoId: string): Promise<{ attempt: DurablePaymentAttempt; acquired: boolean }>;
  save(id: string, token: string | null, patch: Partial<DurablePaymentAttempt>): Promise<DurablePaymentAttempt>;
}
export interface CreatePixPaymentDeps {
  asaasClient: AsaasClient; pedidos: PedidosRepo; now?: () => Date;
}
export interface PixChargeFields {
  asaas_payment_id: string; qr_code_pix: string; pix_copia_e_cola: string; tentativa: PaymentAttempt;
}
export type CreatePixPaymentResult = { ok: true; data: PixChargeFields }
  | { ok: false; error: { status: number; code: string; message: string } };
const failure = (status: number, code: string, message: string): CreatePixPaymentResult => ({ ok: false, error: { status, code, message } });
const reconciliation = () => failure(409, 'PAGAMENTO_RECONCILIACAO', 'Aguarde a conciliação desta tentativa antes de pagar novamente.');

export async function handleCreatePixPayment(
  input: { pedido_id: string; operacao_id: string; usuario_id: string }, deps: CreatePixPaymentDeps,
): Promise<CreatePixPaymentResult> {
  const pedido = await deps.pedidos.getById(input.pedido_id);
  if (!pedido) return failure(404, 'PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.');
  if (!input.usuario_id || pedido.cliente_id !== input.usuario_id) return failure(403, 'ACESSO_NEGADO', 'Pedido não pertence à sessão.');
  if (pedido.status !== 'aguardando_pagamento' || pedido.pago_em) return failure(409, 'PEDIDO_NAO_PAGAVEL', 'Pedido não está aguardando pagamento.');
  if (pedido.forma_pagamento !== 'pix') return failure(409, 'FORMA_DIVERGENTE', 'Método de pagamento divergente.');
  if (!pedido.snapshot_valido || !Number.isSafeInteger(pedido.total_centavos) || pedido.total_centavos! <= 0
    || Math.round(pedido.total_pago_reais * 100) !== pedido.total_centavos) return failure(409, 'SNAPSHOT_INVALIDO', 'Pedido sem cotação válida.');
  if (!pedido.cliente_cpf) return failure(422, 'CLIENTE_SEM_CPF', 'Cadastre seu CPF para pagar.');
  let claim: Awaited<ReturnType<PedidosRepo['claim']>>;
  try { claim = await deps.pedidos.claim(pedido.id, input.operacao_id); }
  catch { return failure(409, 'TENTATIVA_EM_ANDAMENTO', 'Consulte a tentativa existente antes de iniciar outra.'); }
  let attempt = claim.attempt;
  if (attempt.estado === 'reconciliacao') return reconciliation();
  if (attempt.estado === 'recusado' || attempt.estado === 'expirado') return failure(409, 'TENTATIVA_ENCERRADA', 'Tentativa encerrada; uma nova tentativa exige outra operação.');
  if (attempt.estado === 'confirmado' || attempt.estado === 'recebido') return failure(409, 'PAGAMENTO_CONFIRMADO', 'Pagamento já confirmado.');
  if (!claim.acquired && !attempt.asaas_payment_id) return reconciliation();

  if (!attempt.asaas_payment_id) {
    try {
      const customer = await deps.asaasClient.criarCliente({ name: pedido.cliente_nome, cpfCnpj: pedido.cliente_cpf, externalReference: pedido.cliente_id });
      if (!customer.ok) {
        attempt = await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: customer.error.status >= 400 && customer.error.status < 500 ? 'recusado' : 'reconciliacao' });
        return attempt.estado === 'recusado' ? failure(422, 'PAGAMENTO_RECUSADO', 'Não foi possível iniciar o pagamento. Revise seu cadastro.') : reconciliation();
      }
      const charge = await deps.asaasClient.criarCobranca({
        customer: customer.data.id, billingType: 'PIX', value: pedido.total_centavos! / 100,
        dueDate: (deps.now?.() ?? new Date()).toISOString().slice(0, 10), externalReference: attempt.id,
      });
      if (!charge.ok) {
        // Respostas 408/429 e 5xx não provam ausência de efeito externo.
        const rejected = charge.error.status >= 400 && charge.error.status < 500 && ![408, 429].includes(charge.error.status);
        attempt = await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: rejected ? 'recusado' : 'reconciliacao' });
        return rejected ? failure(422, 'PAGAMENTO_RECUSADO', 'Pagamento recusado pelo gateway.') : reconciliation();
      }
      // Persistência ANTES do QR. Se falhar, o claim permanece e proíbe outra criação.
      attempt = await deps.pedidos.save(attempt.id, attempt.claim_token, { asaas_payment_id: charge.data.id, estado: 'pendente' });
    } catch {
      try { await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: 'reconciliacao' }); } catch { /* claim durável continua bloqueando */ }
      return reconciliation();
    }
  }
  if (!attempt.qr_code_pix || !attempt.pix_copia_e_cola) {
    try {
      const qr = await deps.asaasClient.obterQrCodePix(attempt.asaas_payment_id!);
      if (!qr.ok) return failure(502, 'PIX_QR_INDISPONIVEL', 'Cobrança criada. Tente carregar seu QR novamente.');
      attempt = await deps.pedidos.save(attempt.id, attempt.claim_token, {
        qr_code_pix: qr.data.encodedImage, pix_copia_e_cola: qr.data.payload, expira_em: qr.data.expirationDate ?? null,
      });
    } catch { return failure(502, 'PIX_QR_INDISPONIVEL', 'Cobrança criada. Tente carregar seu QR novamente.'); }
  }
  return { ok: true, data: { asaas_payment_id: attempt.asaas_payment_id!, qr_code_pix: attempt.qr_code_pix!, pix_copia_e_cola: attempt.pix_copia_e_cola!, tentativa: publicPaymentAttempt(attempt) } };
}

/** Autenticação vem antes da factory privilegiada; dados do body nunca definem o usuário. */
export function createPixHttpHandler(deps: {
  allowedOrigins: string[];
  authenticate(token: string): Promise<string | null>;
  createDeps(token: string): CreatePixPaymentDeps;
}) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin' };
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !deps.allowedOrigins.includes(origin)) return json(403, { error: { code: 'ORIGEM_NEGADA' } });
    if (origin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json(405, { error: { code: 'METODO_INVALIDO' } });
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: { code: 'AUTENTICACAO_NECESSARIA' } });
    try {
      const token = authorization.slice(7);
      const usuario = await deps.authenticate(token);
      if (!usuario) return json(401, { error: { code: 'AUTENTICACAO_NECESSARIA' } });
      let body: unknown;
      try { body = await req.json(); } catch { return json(400, { error: { code: 'BODY_INVALIDO' } }); }
      const b = body as { pedido_id?: unknown; operacao_id?: unknown } | null;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!b || typeof b.pedido_id !== 'string' || !uuid.test(b.pedido_id) || typeof b.operacao_id !== 'string' || !uuid.test(b.operacao_id)) return json(400, { error: { code: 'ENTRADA_INVALIDA' } });
      const result = await handleCreatePixPayment({ pedido_id: b.pedido_id, operacao_id: b.operacao_id, usuario_id: usuario }, deps.createDeps(token));
      return result.ok ? json(200, { pedido_id: b.pedido_id, ...result.data }) : json(result.error.status, { error: result.error });
    } catch { return json(503, { error: { code: 'PAGAMENTO_INDISPONIVEL', message: 'Não foi possível consultar o pagamento. Preserve esta operação para tentar novamente.' } }); }
  };
}
