import { describe, expect, it } from 'vitest';

import { aceitarPedidoSubtitle } from './aceitarPedidoPresentation';

describe('aceitarPedidoSubtitle', () => {
  it('exibe o hub real do pedido e singular para um item', () => {
    expect(aceitarPedidoSubtitle(1, 'Hub Teste Homologacao')).toBe('1 item · Hub Teste Homologacao');
  });

  it('exibe plural para mais de um item', () => {
    expect(aceitarPedidoSubtitle(2, 'Hub Teste Homologacao')).toBe('2 itens · Hub Teste Homologacao');
  });
});
