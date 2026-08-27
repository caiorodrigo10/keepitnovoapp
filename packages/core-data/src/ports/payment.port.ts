import type { AsyncCallOptions } from '../types';

/**
 * Story 7.2 (AC3) — [IDS] CREATE. Port dedicada e mínima para a cobrança PIX
 * real via Asaas, deliberadamente separada de `OrderPort` (que continua
 * responsável pelo ciclo de vida do pedido em si — criação, aceite,
 * confirmação de PIN etc.). `criarCobrancaPix` é um efeito colateral
 * pós-criação do pedido (chamado por `Pagamento.tsx` depois de
 * `order.create`), nunca parte da criação do pedido — RPCs Postgres não
 * fazem chamada HTTP (ver Dev Notes da Story 7.2).
 */
export interface PixChargeResult {
  pedido_id: string;
  asaas_payment_id: string;
  qr_code_pix: string;
  pix_copia_e_cola: string;
}

export interface PaymentPort {
  /**
   * Cria (ou recupera, se já existir — idempotente por `pedidoId`) a
   * cobrança PIX real no Asaas para o pedido informado. Lança erro
   * descritivo se o pedido não existir (mock) ou se a Edge Function
   * `create-pix-payment` retornar erro (supabase).
   */
  criarCobrancaPix(pedidoId: string, options?: AsyncCallOptions): Promise<PixChargeResult>;
}
