import type { CardCustomerClaim, CardCustomerIdentity, CardCustomerStore, CardEnvironment } from './card-customer.ts';
import type { CardValidationOperation, CardValidationRepository } from './card-validation.ts';

type RpcResult = { data: unknown; error: unknown };
export interface CardRpcClient { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> }

export interface PublicCardOperation { id: string; estado: string; salvarCartao: boolean; avisoCodigo: string | null }
export interface ServerCard { id: string; customerId: string; token: string; bandeira: string; ultimo4: string }
export interface CardPurchaseRepository {
  customerStore: CardCustomerStore;
  registrarCompra(input: { clienteId: string; tentativaId: string; operacaoId: string; ambiente: CardEnvironment; salvarCartao: boolean; cartaoSalvoId: string | null }): Promise<PublicCardOperation>;
  obterCartao(input: { clienteId: string; cartaoId: string; ambiente: CardEnvironment }): Promise<ServerCard>;
  invalidarCartao(input: { clienteId: string; cartaoId: string; operacaoId: string }): Promise<PublicCardOperation>;
  salvarTokenCompra(input: { operacaoId: string; customerId: string; token: string; bandeira: string; ultimo4: string }): Promise<PublicCardOperation>;
  marcarNaoSalvo(input: { operacaoId: string }): Promise<PublicCardOperation>;
  marcarRespostaCobrancaPerdida(input: { operacaoId: string }): Promise<PublicCardOperation>;
}

function record(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('RESPOSTA_INVALIDA');
  return data as Record<string, unknown>;
}
function string(data: Record<string, unknown>, key: string): string {
  if (typeof data[key] !== 'string' || !(data[key] as string).trim()) throw new Error('RESPOSTA_INVALIDA');
  return data[key] as string;
}
function publicOperation(data: unknown): PublicCardOperation {
  const value = record(data);
  if (typeof value.salvarCartao !== 'boolean') throw new Error('RESPOSTA_INVALIDA');
  return { id: string(value, 'id'), estado: string(value, 'estado'), salvarCartao: value.salvarCartao, avisoCodigo: typeof value.avisoCodigo === 'string' ? value.avisoCodigo : null };
}

/** Adapta somente RPCs privadas chamadas por Edge Functions; não usa sessão de app. */
export function createCardRepository(client: CardRpcClient, options: { sleep?: () => Promise<void>; maxWaitAttempts?: number } = {}) {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  const customerStore: CardCustomerStore = {
    async getClientIdentity({ clienteId }): Promise<CardCustomerIdentity | null> {
      const data = await call('obter_cliente_cartao_service', { p_cliente_id: clienteId });
      if (data === null) return null;
      const value = record(data);
      return { id: string(value, 'id'), nome: string(value, 'nome'), cpf: string(value, 'cpf') };
    },
    async claim({ clienteId, ambiente }): Promise<CardCustomerClaim> {
      let data: unknown;
      try {
        data = await call('claim_cliente_asaas_service', { p_cliente_id: clienteId, p_ambiente: ambiente });
      } catch (error) {
        const message = error instanceof Error ? error.message
          : error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string'
            ? (error as Record<string, unknown>).message as string : '';
        if (message.includes('CONTA_EM_EXCLUSAO')) return { kind: 'blocked' };
        throw error;
      }
      const value = record(data);
      const estado = string(value, 'estado');
      if (estado === 'pronto') return { kind: 'ready', customerId: string(value, 'customerId') };
      if (estado === 'reconciliacao') return { kind: 'reconciliation' };
      if (value.acquired === true) return { kind: 'acquired', claimToken: string(value, 'claimToken') };
      return { kind: 'busy' };
    },
    async waitForReady({ clienteId, ambiente }) {
      const attempts = options.maxWaitAttempts ?? 12;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const current = await customerStore.claim({ clienteId, ambiente });
        if (current.kind === 'ready') return current.customerId;
        if (current.kind === 'reconciliation') return null;
        if (attempt + 1 < attempts) await (options.sleep?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 250)));
      }
      return null;
    },
    async finish({ clienteId, ambiente, claimToken, customerId }) {
      await call('finalizar_cliente_asaas_service', { p_cliente_id: clienteId, p_ambiente: ambiente, p_claim_token: claimToken, p_customer_id: customerId });
    },
    async recover({ clienteId, ambiente, customerId }) {
      await call('vincular_cliente_asaas_recuperado_service', { p_cliente_id: clienteId, p_ambiente: ambiente, p_customer_id: customerId });
    },
    async reconcile({ clienteId, ambiente, claimToken }) {
      await call('marcar_cliente_asaas_reconciliacao_service', { p_cliente_id: clienteId, p_ambiente: ambiente, p_claim_token: claimToken ?? null });
    },
  };
  return {
    customerStore,
    async registrarCompra(input: { clienteId: string; tentativaId: string; operacaoId: string; ambiente: CardEnvironment; salvarCartao: boolean; cartaoSalvoId: string | null }) {
      return publicOperation(await call('registrar_operacao_cartao_service', {
        p_cliente_id: input.clienteId, p_tentativa_id: input.tentativaId, p_operacao_id: input.operacaoId, p_contexto: 'compra',
        p_ambiente: input.ambiente, p_salvar_cartao: input.salvarCartao, p_cartao_salvo_id: input.cartaoSalvoId,
      }));
    },
    async registrarPerfil(input: { clienteId: string; operacaoId: string; ambiente: CardEnvironment }) {
      return publicOperation(await call('registrar_operacao_cartao_service', {
        p_cliente_id: input.clienteId, p_tentativa_id: null, p_operacao_id: input.operacaoId, p_contexto: 'perfil',
        p_ambiente: input.ambiente, p_salvar_cartao: true, p_cartao_salvo_id: null,
      }));
    },
    async obterCartao(input: { clienteId: string; cartaoId: string; ambiente: CardEnvironment }): Promise<ServerCard> {
      const value = record(await call('obter_cartao_operacao_service', { p_cliente_id: input.clienteId, p_cartao_id: input.cartaoId, p_ambiente: input.ambiente }));
      const ultimo4 = string(value, 'ultimo4');
      if (!/^\d{4}$/.test(ultimo4)) throw new Error('RESPOSTA_INVALIDA');
      return { id: string(value, 'id'), customerId: string(value, 'customerId'), token: string(value, 'token'), bandeira: string(value, 'bandeira'), ultimo4 };
    },
    async salvarTokenCompra(input: { operacaoId: string; customerId: string; token: string; bandeira: string; ultimo4: string }) {
      return publicOperation(await call('salvar_token_operacao_service', {
        p_operacao_id: input.operacaoId, p_customer_id: input.customerId, p_token: input.token, p_bandeira: input.bandeira, p_ultimo4: input.ultimo4,
      }));
    },
    async marcarNaoSalvo(input: { operacaoId: string }) {
      return publicOperation(await call('marcar_cartao_nao_salvo_service', { p_operacao_id: input.operacaoId }));
    },
    async marcarRespostaCobrancaPerdida(input: { operacaoId: string }) {
      return publicOperation(await call('marcar_resposta_cobranca_perdida_service', { p_operacao_id: input.operacaoId }));
    },
    async invalidarCartao(input: { clienteId: string; cartaoId: string; operacaoId: string }) {
      return publicOperation(await call('invalidar_cartao_operacao_service', { p_cliente_id: input.clienteId, p_cartao_id: input.cartaoId, p_operacao_id: input.operacaoId }));
    },
  };
}

function validationOperation(data: unknown): CardValidationOperation {
  const value = record(data);
  const estado = string(value, 'estado') as CardValidationOperation['estado'];
  if (!Number.isSafeInteger(value.valorCentavos) || (value.valorCentavos as number) <= 0) throw new Error('RESPOSTA_INVALIDA');
  const nullable = (key: string) => typeof value[key] === 'string' && value[key].trim() ? value[key] as string : null;
  if (typeof value.estornoConfirmado !== 'boolean') throw new Error('RESPOSTA_INVALIDA');
  return { id: string(value, 'id'), clienteId: string(value, 'clienteId'), ambiente: string(value, 'ambiente') as CardEnvironment,
    valorCentavos: value.valorCentavos as number, estado, customerId: nullable('customerId'), token: nullable('token'), bandeira: nullable('bandeira'), ultimo4: nullable('ultimo4'), cobrancaId: nullable('cobrancaId'), estornoId: nullable('estornoId'), estornoConfirmado: value.estornoConfirmado };
}

/** Private validation-operation RPCs. Tokens are read only by this server adapter. */
export function createCardValidationRepository(client: CardRpcClient): CardValidationRepository {
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args); if (error) throw error; return data;
  };
  const cards = createCardRepository(client);
  return {
    customerStore: cards.customerStore,
    async register(input) { return validationOperation(await call('registrar_validacao_cartao_service', { p_cliente_id: input.clienteId, p_operacao_id: input.operationId, p_ambiente: input.ambiente, p_valor_centavos: input.valorCentavos })); },
    async get(operationId) { const data = await call('obter_validacao_cartao_service', { p_operacao_id: operationId }); return data === null ? null : validationOperation(data); },
    async claim(operationId, stage) { const value = record(await call('claim_validacao_cartao_service', { p_operacao_id: operationId, p_etapa: stage })); return { acquired: value.acquired === true, operation: validationOperation(value.operacao) }; },
    async saveToken(operationId, token) { return validationOperation(await call('salvar_token_validacao_cartao_service', { p_operacao_id: operationId, p_customer_id: token.customerId, p_token: token.token, p_bandeira: token.bandeira, p_ultimo4: token.ultimo4 })); },
    async saveCharge(operationId, paymentId) { return validationOperation(await call('registrar_cobranca_validacao_cartao_service', { p_operacao_id: operationId, p_cobranca_id: paymentId })); },
    async reconcileCharge(operationId, paymentId) { return validationOperation(await call('reconciliar_cobranca_validacao_cartao_service', { p_operacao_id: operationId, p_cobranca_id: paymentId })); },
    async saveRefund(operationId, refund) { return validationOperation(await call('registrar_estorno_validacao_cartao_service', { p_operacao_id: operationId, p_estorno_id: refund.id, p_valor_centavos: refund.valorCentavos, p_confirmado: refund.confirmado })); },
    async confirmRefund(operationId) { return validationOperation(await call('confirmar_estorno_validacao_cartao_service', { p_operacao_id: operationId })); },
    async finish(operationId) { return validationOperation(await call('finalizar_validacao_cartao_service', { p_operacao_id: operationId })); },
    async fail(operationId, code) { return validationOperation(await call('falhar_validacao_cartao_service', { p_operacao_id: operationId, p_codigo: code })); },
  };
}
