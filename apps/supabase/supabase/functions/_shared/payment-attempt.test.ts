import { expect, it } from 'vitest';
import { canRetryPayment } from './payment-attempt';
it.each(['criando','pendente','reconciliacao','confirmado','recebido'] as const)('não repete operação %s', (estado) => {
  expect(canRetryPayment(estado)).toBe(false);
});
it.each(['recusado','expirado'] as const)('permite outra operação após %s confirmado', (estado) => {
  expect(canRetryPayment(estado)).toBe(true);
});
