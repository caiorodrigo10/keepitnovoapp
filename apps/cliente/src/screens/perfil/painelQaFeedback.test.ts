import { describe, expect, it } from 'vitest';

import { getQaResetFeedback } from './painelQaFeedback';

describe('getQaResetFeedback', () => {
  it('informa restauração completa sem mensagem complementar', () => {
    expect(getQaResetFeedback({ status: 'reset' })).toEqual({
      title: 'Cenário restaurado',
    });
  });

  it('informa degradação com todas as camadas em linguagem legível', () => {
    expect(
      getQaResetFeedback({
        status: 'degraded',
        failures: ['scenario-persistence', 'cart-persistence', 'cart-live-state'],
      }),
    ).toEqual({
      title: 'Cenário limpo em memória, mas uma ou mais camadas não foram persistidas',
      message:
        'Camadas afetadas: persistência do cenário, persistência do carrinho e carrinho em memória.',
    });
  });

  it('informa indisponibilidade fora do datasource mock', () => {
    expect(getQaResetFeedback({ status: 'unavailable' })).toEqual({
      title: 'Reset indisponível',
      message: 'Reset disponível somente no datasource mock.',
    });
  });

  it('não produz feedback quando o reset é cancelado', () => {
    expect(getQaResetFeedback({ status: 'cancelled' })).toBeNull();
  });
});
