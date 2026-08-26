import { describe, expect, it } from 'vitest';

import { shouldConfirmStoreSwitch } from './cartRules';

describe('shouldConfirmStoreSwitch (Story 6.1, AC3)', () => {
  it('não confirma quando não há loja atual (carrinho vazio, primeiro item)', () => {
    expect(shouldConfirmStoreSwitch(null, 'estab-2', 0)).toBe(false);
  });

  it('não confirma quando é a mesma loja', () => {
    expect(shouldConfirmStoreSwitch('estab-1', 'estab-1', 3)).toBe(false);
  });

  it('não confirma quando o carrinho atual está vazio, mesmo trocando de loja', () => {
    expect(shouldConfirmStoreSwitch('estab-1', 'estab-2', 0)).toBe(false);
  });

  it('confirma quando troca de loja com carrinho atual não-vazio', () => {
    expect(shouldConfirmStoreSwitch('estab-1', 'estab-2', 2)).toBe(true);
  });
});
