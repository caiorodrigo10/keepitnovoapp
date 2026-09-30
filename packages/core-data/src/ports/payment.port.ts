import type { PaymentAttempt } from '@keepit/shared-types';
export type { PaymentAttempt } from '@keepit/shared-types';
import type { AsyncCallOptions } from '../types';

/** Compatibilidade PIX: sempre deriva o valor do pedido cotado no servidor. */
export interface PixChargeResult {
  pedido_id: string;
  asaas_payment_id: string;
  qr_code_pix: string;
  pix_copia_e_cola: string;
}

export interface CardInput {
  holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string;
}
export interface HolderInput {
  name: string; email: string; cpfCnpj: string; postalCode: string; addressNumber: string; phone: string;
}
export interface PaymentExtensions {
  iniciarPix(input: { pedidoId: string; operacaoId: string }): Promise<PaymentAttempt>;
  pagarCartao(input: { pedidoId: string; operacaoId: string; cartao: CardInput; titular: HolderInput }): Promise<PaymentAttempt>;
  consultar(pedidoId: string): Promise<PaymentAttempt | null>;
}
export interface PaymentPort extends PaymentExtensions {
  /**
   * Cria (ou recupera, se já existir — idempotente por `pedidoId`) a
   * cobrança PIX real no Asaas para o pedido informado. Lança erro
   * descritivo se o pedido não existir (mock) ou se a Edge Function
   * `create-pix-payment` retornar erro (supabase).
   */
  criarCobrancaPix(pedidoId: string, options?: AsyncCallOptions): Promise<PixChargeResult>;
}
