import { describe, expect, it } from 'vitest';

import { CUSTOMER_LABELS } from './customer-labels';

describe('CUSTOMER_LABELS', () => {
  it('centraliza a cobrança de deslocamento como Frete', () => {
    expect(CUSTOMER_LABELS.freight).toBe('Frete');
  });
});
