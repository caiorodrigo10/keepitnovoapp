import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';
import type { PaymentAttempt, PaymentPort, PixChargeResult } from '../ports/payment.port';

function parseAttempt(data: unknown): PaymentAttempt {
  const value = data as PaymentAttempt | null;
  if (!value || typeof value.id !== 'string' || typeof value.pedidoId !== 'string'
    || !['criando','pendente','confirmado','recebido','recusado','expirado','reconciliacao'].includes(value.estado)) throw new Error('RESPOSTA_INVALIDA');
  return { id: value.id, pedidoId: value.pedidoId, estado: value.estado,
    ...(typeof value.operacaoId === 'string' ? { operacaoId: value.operacaoId } : {}),
    ...(value.pix && typeof value.pix.imagemBase64 === 'string' && typeof value.pix.copiaCola === 'string'
      ? { pix: { imagemBase64: value.pix.imagemBase64, copiaCola: value.pix.copiaCola, expiraEm: value.pix.expiraEm } } : {}),
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
  return {
    async encerrarTentativa(input) {
      return parseAttempt((await invoke('close-payment-attempt', { tentativa_id: input.tentativaId, operacao_id: input.operacaoId })).tentativa);
    },
    async iniciarPix(input) { return parseAttempt((await invoke('create-pix-payment', { pedido_id: input.pedidoId, operacao_id: input.operacaoId })).tentativa); },
    async pagarCartao(input) {
      try {
        const { holderName, number, expiryMonth, expiryYear, ccv } = input.cartao;
        const { name, email, cpfCnpj, postalCode, addressNumber, phone } = input.titular;
        return parseAttempt((await invoke('create-card-payment', {
          pedido_id: input.pedidoId, operacao_id: input.operacaoId,
          cartao: { holderName, number, expiryMonth, expiryYear, ccv },
          titular: { name, email, cpfCnpj, postalCode, addressNumber, phone },
        })).tentativa);
      } catch { throw new Error('Não foi possível processar o cartão. Consulte o estado do pedido antes de tentar novamente.'); }
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
