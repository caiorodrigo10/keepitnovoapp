import { describe, expect, it } from 'vitest';

import { separacaoPedidoPresentation } from './separacaoPedidoPresentation';

describe('separacaoPedidoPresentation', () => {
  it('mantém 1/1 ao receber novamente o pedido com o item separado persistido', () => {
    const pedidoRemontado = {
      itens: [{ separado: true }],
    };

    expect(separacaoPedidoPresentation(pedidoRemontado)).toMatchObject({ separados: 1, total: 1, todosSeparados: true });
  });

  it('não considera pronto quando há item ainda não separado', () => {
    expect(
      separacaoPedidoPresentation({
        itens: [
          { separado: true },
          { separado: false },
        ],
      }),
    ).toMatchObject({ separados: 1, total: 2, todosSeparados: false });
  });

  it('agrupa o snapshot histórico por grupo, preservando ordem, preço e fallback legado', () => {
    const pedido = {
      itens: [{
        separado: false,
        complementos_snapshot: [
          { grupoId: 'tamanho', grupoNome: 'Tamanho', itemId: 'grande', itemNome: 'Grande', precoExtraCentavos: 400 },
          { grupoId: 'adicionais', grupoNome: 'Adicionais', itemId: 'bacon', itemNome: 'Bacon', precoExtraCentavos: 500 },
          { grupoId: 'adicionais', grupoNome: 'Adicionais', itemId: 'queijo', itemNome: 'Queijo', precoExtraCentavos: 0 },
          { itemId: 'legado', itemNome: 'Molho', precoExtraCentavos: 200 },
        ],
      }],
    };

    expect(separacaoPedidoPresentation(pedido).complementosPorItem).toEqual([[
      'Tamanho: Grande (+R$ 4,00) · por unidade',
      'Adicionais: Bacon (+R$ 5,00), Queijo (Grátis) · por unidade',
      'Complementos: Molho (+R$ 2,00) · por unidade',
    ]]);
  });

  it('nunca une IDs distintos com o mesmo nome e não muta o snapshot', () => {
    const snapshot = [
      { grupoId: 'primeiro', grupoNome: 'Opções', itemId: 'a', itemNome: 'A', precoExtraCentavos: 0 },
      { grupoId: 'segundo', grupoNome: 'Opções', itemId: 'b', itemNome: 'B', precoExtraCentavos: 0 },
      { grupoNome: 'Sem ID', itemId: 'c', itemNome: 'C', precoExtraCentavos: 0 },
    ];
    const original = structuredClone(snapshot);

    expect(separacaoPedidoPresentation({ itens: [{ separado: false, complementos_snapshot: snapshot }] }).complementosPorItem).toEqual([[
      'Opções: A (Grátis) · por unidade',
      'Opções: B (Grátis) · por unidade',
      'Sem ID: C (Grátis) · por unidade',
    ]]);
    expect(snapshot).toEqual(original);
  });

  it.each([undefined, null, []])('não cria linha de complemento para snapshot %j', (snapshot) => {
    expect(separacaoPedidoPresentation({ itens: [{ separado: false, complementos_snapshot: snapshot }] }).complementosPorItem)
      .toEqual([[]]);
  });
});
