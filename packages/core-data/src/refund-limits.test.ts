import { expect, it } from 'vitest';
import { remainingRefund } from './refund-limits';

it('desconta devoluções concluídas e reservas aprovadas em centavos', () => {
  expect(remainingRefund(10_000, 3_000, 2_000)).toBe(5_000);
  expect(remainingRefund(10_000, 10_000, 0)).toBe(0);
});

it('rejeita total comprometido maior que o valor pago', () => {
  expect(() => remainingRefund(10_000, 8_000, 3_000)).toThrow('REEMBOLSO_EXCEDIDO');
});

it.each([[1.5, 0, 0], [10, -1, 0], [Number.MAX_SAFE_INTEGER + 1, 0, 0]])(
  'rejeita valores não inteiros ou negativos', (paid, completed, reserved) => {
    expect(() => remainingRefund(paid, completed, reserved)).toThrow('VALOR_INVALIDO');
  },
);
