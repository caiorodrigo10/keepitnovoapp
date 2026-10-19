import type { AsaasCardInput, AsaasClient, AsaasHolderInput } from './asaas.ts';
import { getOrCreateCardCustomer, type CardEnvironment, type CardCustomerStore } from './card-customer.ts';

export type CardValidationState = 'preparada' | 'tokenizado' | 'validando' | 'estorno_pendente' | 'concluida' | 'recusada' | 'reconciliacao';
export type CardValidationOperation = {
  id: string; clienteId: string; ambiente: CardEnvironment; valorCentavos: number; estado: CardValidationState;
  customerId: string | null; token: string | null; bandeira: string | null; ultimo4: string | null;
  cobrancaId: string | null; estornoId: string | null; estornoConfirmado: boolean;
};
export interface CardValidationRepository {
  customerStore: CardCustomerStore;
  register(input: { clienteId: string; operationId: string; ambiente: CardEnvironment; valorCentavos: number }): Promise<CardValidationOperation>;
  get(operationId: string): Promise<CardValidationOperation | null>;
  claim(operationId: string, stage: 'tokenizar' | 'cobrar' | 'estornar' | 'finalizar'): Promise<{ acquired: boolean; operation: CardValidationOperation }>;
  saveToken(operationId: string, token: { customerId: string; token: string; bandeira: string; ultimo4: string }): Promise<CardValidationOperation>;
  saveCharge(operationId: string, paymentId: string): Promise<CardValidationOperation>;
  reconcileCharge(operationId: string, paymentId: string): Promise<CardValidationOperation>;
  saveRefund(operationId: string, refund: { id: string; valorCentavos: number; confirmado: boolean }): Promise<CardValidationOperation>;
  confirmRefund(operationId: string): Promise<CardValidationOperation>;
  finish(operationId: string): Promise<CardValidationOperation>;
  fail(operationId: string, code: 'RECUSADA' | 'RECONCILIACAO'): Promise<CardValidationOperation>;
}
export interface CardValidationDeps { ambiente?: CardEnvironment; cards: CardValidationRepository; asaas: Pick<AsaasClient, 'criarCliente' | 'listarClientesPorReferencia' | 'tokenizarCartao' | 'criarCobranca' | 'consultarCobranca' | 'listarCobrancasPorReferencia' | 'estornarCobranca'>; }

const terminal = (state: CardValidationState) => ['concluida', 'recusada', 'reconciliacao'].includes(state);
const publicOperation = (operation: CardValidationOperation) => ({ id: operation.id, estado: operation.estado, valorCentavos: operation.valorCentavos });
const definitiveRefusal = (error: { cardFailure?: { categoria: string } }) => error.cardFailure?.categoria === 'recusado';

/**
 * Advances exactly one durably claimed stage.  It never recreates a token or
 * financial POST after a lost response: those cases remain reconcilable.
 */
export async function advanceCardValidation(input: {
  clienteId: string; operationId: string; cartao?: AsaasCardInput; titular?: AsaasHolderInput; remoteIp: string; valorCentavos?: number;
}, deps: CardValidationDeps): Promise<ReturnType<typeof publicOperation>> {
  const ambiente = deps.ambiente ?? 'sandbox';
  let operation = await deps.cards.register({ clienteId: input.clienteId, operationId: input.operationId, ambiente, valorCentavos: input.valorCentavos ?? 0 });
  let chargeConfirmedThisCall = false;
  let refundConfirmedThisCall = false;
  // Registration may return this client's already-active operation.  Every
  // later claim must use that canonical server-selected id, never a UUID from
  // a newer request.
  const operationId = operation.id;
  if (operation.clienteId !== input.clienteId || operation.ambiente !== ambiente) return publicOperation(operation);
  if (terminal(operation.estado)) return publicOperation(operation);
  try {
    if (operation.estado === 'preparada') {
      if (!input.cartao || !input.titular) return publicOperation(operation);
      const claimed = await deps.cards.claim(operationId, 'tokenizar');
      operation = claimed.operation;
      if (!claimed.acquired) return publicOperation(operation);
      const customer = await getOrCreateCardCustomer({ clienteId: input.clienteId, ambiente, store: deps.cards.customerStore, asaas: deps.asaas });
      if (!customer.ok) return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
      const tokenized = await deps.asaas.tokenizarCartao({ customer: customer.customerId, creditCard: input.cartao, creditCardHolderInfo: input.titular, remoteIp: input.remoteIp });
      if (!tokenized.ok) return publicOperation(await deps.cards.fail(operationId, definitiveRefusal(tokenized.error) ? 'RECUSADA' : 'RECONCILIACAO'));
      operation = await deps.cards.saveToken(operationId, { customerId: customer.customerId, ...tokenized.data });
    }
    if (operation.estado === 'tokenizado') {
      const claimed = await deps.cards.claim(operationId, 'cobrar');
      operation = claimed.operation;
      if (!claimed.acquired) return publicOperation(operation);
      if (!operation.customerId || !operation.token) return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
      const charge = await deps.asaas.criarCobranca({ customer: operation.customerId, billingType: 'CREDIT_CARD', value: operation.valorCentavos / 100,
        dueDate: new Date().toISOString().slice(0, 10), externalReference: `card-validation:${operationId}`, creditCardToken: operation.token, remoteIp: input.remoteIp });
      if (!charge.ok) return publicOperation(await deps.cards.fail(operationId, definitiveRefusal(charge.error) ? 'RECUSADA' : 'RECONCILIACAO'));
      operation = await deps.cards.saveCharge(operationId, charge.data.id);
      if (!['CONFIRMED', 'RECEIVED'].includes(charge.data.status)) return publicOperation(operation);
      if (Math.round(charge.data.value * 100) !== operation.valorCentavos) return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
      chargeConfirmedThisCall = true;
    }
    if (operation.estado === 'validando' && operation.cobrancaId) {
      const paymentId = operation.cobrancaId;
      if (!paymentId) return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
      // Observe an earlier asynchronous payment before acquiring the refund
      // stage. A pending observation leaves no permanent claim behind.
      if (!chargeConfirmedThisCall) {
        const payment = await deps.asaas.consultarCobranca(paymentId);
        if (!payment.ok) return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
        if (!['CONFIRMED', 'RECEIVED'].includes(payment.data.status)) return publicOperation(operation);
        if (Math.round(payment.data.value * 100) !== operation.valorCentavos) return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
      }
      const claimed = await deps.cards.claim(operationId, 'estornar');
      operation = claimed.operation;
      if (!claimed.acquired) return publicOperation(operation);
      const refund = await deps.asaas.estornarCobranca(paymentId);
      if (!refund.ok) return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
      const refundConfirmed = refund.data.status === 'REFUNDED' && Math.round(refund.data.value * 100) === operation.valorCentavos;
      // The documented refund response can be a payment projection.  Never
      // mislabel that payment id as a refund id: absence is reconciliation.
      if (!refund.data.refundId) return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
      operation = await deps.cards.saveRefund(operationId, { id: refund.data.refundId, valorCentavos: Math.round(refund.data.value * 100), confirmado: refundConfirmed });
      if (!refundConfirmed) return publicOperation(operation);
      refundConfirmedThisCall = true;
    }
    if (operation.estado === 'estorno_pendente') {
      const paymentId = operation.cobrancaId;
      if (!paymentId) return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
      // As with charges, a still-pending refund must remain retryable by
      // reconciliation, not consume a finalization claim.
      if (!refundConfirmedThisCall) {
        const payment = await deps.asaas.consultarCobranca(paymentId);
        if (!payment.ok) return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
        if (payment.data.status !== 'REFUNDED' || Math.round(payment.data.value * 100) !== operation.valorCentavos) return publicOperation(operation);
      }
      const claimed = await deps.cards.claim(operationId, 'finalizar');
      operation = claimed.operation;
      if (!claimed.acquired) return publicOperation(operation);
      if (!refundConfirmedThisCall) {
        operation = await deps.cards.confirmRefund(operationId);
      }
      operation = await deps.cards.finish(operationId);
    }
    return publicOperation(operation);
  } catch {
    return publicOperation(await deps.cards.fail(operationId, 'RECONCILIACAO'));
  }
}
