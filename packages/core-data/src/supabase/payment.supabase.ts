import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';
import type { PaymentAttempt, PaymentPort, PixChargeResult } from '../ports/payment.port';

function parseAttempt(data: unknown): PaymentAttempt {
  const value = data as PaymentAttempt | null;
  if (!value || typeof value.id !== 'string' || typeof value.pedidoId !== 'string'
    || !['criando','pendente','confirmado','recebido','recusado','expirado','reconciliacao'].includes(value.estado)) throw new Error('RESPOSTA_INVALIDA');
  return value;
}
export function createPaymentSupabase(client?: SupabaseClient<Database>): PaymentPort {
  const resolve = () => (client ??= createClient());
  async function invoke(pedidoId: string, operacaoId: string) {
    const { data, error } = await resolve().functions.invoke('create-pix-payment', { body: { pedido_id: pedidoId, operacao_id: operacaoId } });
    if (error) {
      // O SDK guarda o payload não-2xx na Response; preserva orientação de conciliação.
      const response = (error as { context?: Response }).context;
      const body = response && typeof response.clone === 'function' ? await response.clone().json().catch(() => null) : null;
      throw new Error(body?.error?.message ?? error.message);
    }
    if (!data || data.error) throw new Error(data?.error?.message ?? 'resposta vazia/inesperada da Edge Function create-pix-payment.');
    return data;
  }
  return {
    async iniciarPix(input) { return parseAttempt((await invoke(input.pedidoId, input.operacaoId)).tentativa); },
    async pagarCartao() { throw new Error('PAGAMENTO_CARTAO_INDISPONIVEL: integração de cartão ainda não habilitada.'); },
    async consultar(pedidoId) {
      const { data, error } = await resolve().rpc('consultar_tentativa_pagamento', { p_pedido_id: pedidoId });
      if (error) throw error;
      return data === null ? null : parseAttempt(data);
    },
    async criarCobrancaPix(pedidoId): Promise<PixChargeResult> {
      // Compatibilidade segura: operação estável por pedido, nenhum preço do app.
      const data = await invoke(pedidoId, pedidoId);
      return { pedido_id: data.pedido_id, asaas_payment_id: data.asaas_payment_id, qr_code_pix: data.qr_code_pix, pix_copia_e_cola: data.pix_copia_e_cola };
    },
  };
}
