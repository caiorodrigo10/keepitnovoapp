import { expect, it } from 'vitest';

import { reconcilePaymentSelection } from '../../context/CartContext';

const cards = [
  { id: 'principal', bandeira: 'visa', ultimo4: '1111', principal: true },
  { id: 'alternativo', bandeira: 'mastercard', ultimo4: '2222', principal: false },
];

it('sugere o principal somente sem seleção explícita', () => {
  expect(reconcilePaymentSelection(null, cards)).toEqual({ type: 'cartao_salvo', cartaoSalvoId: 'principal' });
  expect(reconcilePaymentSelection({ type: 'cartao_salvo', cartaoSalvoId: 'alternativo' }, cards)).toEqual({ type: 'cartao_salvo', cartaoSalvoId: 'alternativo' });
});

it('limpa cartão removido sem trocá-lo silenciosamente pelo principal', () => {
  expect(reconcilePaymentSelection({ type: 'cartao_salvo', cartaoSalvoId: 'removido-em-outro-dispositivo' }, cards)).toBeNull();
});

it('cartão novo é uma variante explícita, não um identificador transitorio', () => {
  expect(reconcilePaymentSelection({ type: 'cartao_novo' }, cards)).toEqual({ type: 'cartao_novo' });
});
