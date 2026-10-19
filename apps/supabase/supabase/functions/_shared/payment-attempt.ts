import type { PaymentAttempt } from '@keepit/shared-types/payment';
export type { PaymentAttempt };

/** Somente desfechos definitivos permitem uma NOVA operação. */
export function canRetryPayment(estado: PaymentAttempt['estado']): boolean {
  return estado === 'recusado' || estado === 'expirado';
}
export interface DurablePaymentAttempt {
  id: string;
  pedido_id: string;
  operacao_id: string;
  forma: 'pix' | 'cartao';
  estado: PaymentAttempt['estado'];
  asaas_payment_id: string | null;
  qr_code_pix: string | null;
  pix_copia_e_cola: string | null;
  expira_em: string | null;
  claim_token: string | null;
  aviso_cartao?: 'nao_salvo' | null;
}
export function publicPaymentAttempt(attempt: DurablePaymentAttempt, avisoCartao?: 'nao_salvo'): PaymentAttempt {
  return {
    id: attempt.id, pedidoId: attempt.pedido_id, operacaoId: attempt.operacao_id, estado: attempt.estado,
    ...(attempt.qr_code_pix && attempt.pix_copia_e_cola ? { pix: {
      imagemBase64: attempt.qr_code_pix, copiaCola: attempt.pix_copia_e_cola, expiraEm: attempt.expira_em,
    } } : {}),
    ...((avisoCartao ?? attempt.aviso_cartao) === 'nao_salvo' ? { avisoCartao: 'nao_salvo' } : {}),
  };
}
