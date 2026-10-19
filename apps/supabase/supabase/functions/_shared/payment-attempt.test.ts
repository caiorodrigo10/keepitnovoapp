import { expect, it } from 'vitest';
import { canRetryPayment, publicPaymentAttempt } from './payment-attempt';
it.each(['criando','pendente','reconciliacao','confirmado','recebido'] as const)('não repete operação %s', (estado) => {
  expect(canRetryPayment(estado)).toBe(false);
});
it.each(['recusado','expirado'] as const)('permite outra operação após %s confirmado', (estado) => {
  expect(canRetryPayment(estado)).toBe(true);
});
it('preserva no replay somente o aviso público de cartão não salvo', () => {
  expect(publicPaymentAttempt({
    id: 'attempt', pedido_id: 'order', operacao_id: 'operation', forma: 'cartao', estado: 'pendente',
    asaas_payment_id: 'payment', qr_code_pix: null, pix_copia_e_cola: null, expira_em: null, claim_token: null, aviso_cartao: 'nao_salvo',
  })).toEqual({ id: 'attempt', pedidoId: 'order', operacaoId: 'operation', estado: 'pendente', avisoCartao: 'nao_salvo' });
});
