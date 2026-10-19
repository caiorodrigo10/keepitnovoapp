import { describe, expect, it } from 'vitest';

import type { Pedido, PedidoStatus } from '@keepit/core-data';

import { resolveOrdersViewState } from './ordersViewState';

const pedido = (status: PedidoStatus): Pedido => ({
  id: `pedido-${status}`,
  cliente_id: 'cliente-ana',
  status,
}) as Pedido;

describe('resolveOrdersViewState', () => {
  it('prioriza os quatro estados simulados sem alterar os dados canônicos', () => {
    const canonical = { data: [pedido('aceito')], loading: false, error: null };

    expect(resolveOrdersViewState(canonical, 'normal')).toMatchObject({ kind: 'content' });
    expect(resolveOrdersViewState(canonical, 'loading')).toEqual({ kind: 'loading' });
    expect(resolveOrdersViewState(canonical, 'empty')).toEqual({ kind: 'empty' });
    expect(resolveOrdersViewState(canonical, 'error')).toEqual({ kind: 'error' });
    expect(canonical.data).toHaveLength(1);
  });
});
