import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';
import type { PaymentAttempt, PaymentPort, PixChargeResult } from '../ports/payment.port';
import { isPaymentActionErrorCode, PaymentActionError } from '../payment-errors';

function parseAttempt(data: unknown): PaymentAttempt {
  const value = data as PaymentAttempt | null;
  if (!value || typeof value.id !== 'string' || typeof value.pedidoId !== 'string'
    || !['criando','pendente','confirmado','recebido','recusado','expirado','reconciliacao'].includes(value.estado)) throw new Error('RESPOSTA_INVALIDA');
  if (value.operacaoId !== undefined && typeof value.operacaoId !== 'string') throw new Error('RESPOSTA_INVALIDA');
  if (value.avisoCartao !== undefined && value.avisoCartao !== 'nao_salvo') throw new Error('RESPOSTA_INVALIDA');
  if (value.pix !== undefined && (!value.pix || typeof value.pix.imagemBase64 !== 'string' || typeof value.pix.copiaCola !== 'string'
    || (value.pix.expiraEm !== null && typeof value.pix.expiraEm !== 'string'))) throw new Error('RESPOSTA_INVALIDA');
  return { id: value.id, pedidoId: value.pedidoId, estado: value.estado,
    ...(typeof value.operacaoId === 'string' ? { operacaoId: value.operacaoId } : {}),
    ...(value.pix
      ? { pix: { imagemBase64: value.pix.imagemBase64, copiaCola: value.pix.copiaCola, expiraEm: value.pix.expiraEm } } : {}),
    ...(value.avisoCartao === 'nao_salvo' ? { avisoCartao: 'nao_salvo' } : {}),
  };
}
export function createPaymentSupabase(client?: SupabaseClient<Database>): PaymentPort {
  const resolve = () => (client ??= createClient());
  async function invoke(name: string, body: Record<string, unknown>) {
    const { data, error } = await resolve().functions.invoke(name, { body });
    if (error) {
      // O SDK guarda o payload não-2xx na Response; preserva orientação de conciliação.
      const response = (error as { context?: Response }).context;
      const body = response && typeof response.clone === 'function' ? await response.clone().json().catch(() => null) : null;
      throw new Error(body?.error?.message ?? error.message);
    }
    if (!data || data.error) throw new Error(data?.error?.message ?? 'resposta vazia/inesperada da Edge Function create-pix-payment.');
    return data;
  }
  async function invokeCard(body: Record<string, unknown>) {
    const { data, error } = await resolve().functions.invoke('create-card-payment', { body });
    let code: unknown;
    if (error) {
      const response = (error as { context?: Response }).context;
      const responseBody = response && typeof response.clone === 'function' ? await response.clone().json().catch(() => null) : null;
      code = (responseBody as { error?: { code?: unknown } } | null)?.error?.code;
    } else if (data && typeof data === 'object') {
      code = (data as { error?: { code?: unknown } }).error?.code;
    }
    if (error || code !== undefined) throw new PaymentActionError(isPaymentActionErrorCode(code) ? code : 'CARTAO_INDISPONIVEL');
    return data;
  }
  return {
    async encerrarTentativa(input) {
      return parseAttempt((await invoke('close-payment-attempt', { tentativa_id: input.tentativaId, operacao_id: input.operacaoId })).tentativa);
    },
    async iniciarPix(input) { return parseAttempt((await invoke('create-pix-payment', { pedido_id: input.pedidoId, operacao_id: input.operacaoId })).tentativa); },
    async pagarCartao(input) {
      if ('cartaoSalvoId' in input) {
        return parseAttempt((await invokeCard({ pedido_id: input.pedidoId, operacao_id: input.operacaoId, cartao_salvo_id: input.cartaoSalvoId })).tentativa);
      }
        const { holderName, number, expiryMonth, expiryYear, ccv } = input.cartao;
        const { name, email, cpfCnpj, postalCode, addressNumber, phone } = input.titular;
        return parseAttempt((await invokeCard({
          pedido_id: input.pedidoId, operacao_id: input.operacaoId,
          cartao: { holderName, number, expiryMonth, expiryYear, ccv },
          titular: { name, email, cpfCnpj, postalCode, addressNumber, phone },
          salvar_cartao: input.salvarCartao === true,
        })).tentativa);
    },
    async consultar(pedidoId) {
      const { data, error } = await resolve().rpc('consultar_tentativa_pagamento', { p_pedido_id: pedidoId });
      if (error) throw error;
      return data === null ? null : parseAttempt(data);
    },
    async criarCobrancaPix(pedidoId): Promise<PixChargeResult> {
      // Compatibilidade segura: operação estável por pedido, nenhum preço do app.
      const data = await invoke('create-pix-payment', { pedido_id: pedidoId, operacao_id: pedidoId });
      return { pedido_id: data.pedido_id, asaas_payment_id: data.asaas_payment_id, qr_code_pix: data.qr_code_pix, pix_copia_e_cola: data.pix_copia_e_cola };
    },
  };
}
