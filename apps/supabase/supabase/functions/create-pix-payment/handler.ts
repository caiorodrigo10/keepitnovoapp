import { createPaymentHttpHandler } from '../_shared/payment-http.ts';
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
const definitiveRejection = (status: number) => status >= 400 && status < 500 && ![408, 429].includes(status);
const reconciliation = () => failure(409, 'PAGAMENTO_RECONCILIACAO', 'Aguarde a conciliação desta tentativa antes de pagar novamente.');

export async function handleCreatePixPayment(
  input: { pedido_id: string; operacao_id: string; usuario_id: string }, deps: CreatePixPaymentDeps,
): Promise<CreatePixPaymentResult> {
  const pedido = await deps.pedidos.getById(input.pedido_id);
  if (!pedido) return failure(404, 'PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.');
  if (!input.usuario_id || pedido.cliente_id !== input.usuario_id) return failure(403, 'ACESSO_NEGADO', 'Pedido não pertence à sessão.');
  if (pedido.status !== 'aguardando_pagamento' || pedido.pago_em) return failure(409, 'PEDIDO_NAO_PAGAVEL', 'Pedido não está aguardando pagamento.');
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
        attempt = await deps.pedidos.save(attempt.id, attempt.claim_token, { estado: definitiveRejection(customer.error.status) ? 'recusado' : 'reconciliacao' });
        return attempt.estado === 'recusado' ? failure(422, 'PAGAMENTO_RECUSADO', 'Não foi possível iniciar o pagamento. Revise seu cadastro.') : reconciliation();
      }
      const charge = await deps.asaasClient.criarCobranca({
        customer: customer.data.id, billingType: 'PIX', value: pedido.total_centavos! / 100,
        dueDate: (deps.now?.() ?? new Date()).toISOString().slice(0, 10), externalReference: attempt.id,
      });
      if (!charge.ok) {
        // Respostas 408/429 e 5xx não provam ausência de efeito externo.
        const rejected = definitiveRejection(charge.error.status);
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
  return createPaymentHttpHandler({
    idField: 'pedido_id', allowedOrigins: deps.allowedOrigins, authenticate: deps.authenticate,
    async execute(pedidoId, operacaoId, usuarioId, token) {
      const result = await handleCreatePixPayment({ pedido_id: pedidoId, operacao_id: operacaoId, usuario_id: usuarioId }, deps.createDeps(token));
      return result.ok ? { status: 200, body: { pedido_id: pedidoId, ...result.data } } : { status: result.error.status, body: { error: result.error } };
    },
  });
}
