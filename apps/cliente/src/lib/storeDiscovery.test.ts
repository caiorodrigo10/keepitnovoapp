import { describe, expect, it } from 'vitest';

import type { Estabelecimento, EstabelecimentoStatus } from '@keepit/core-data';

import { selectStoresForSurface } from './storeDiscovery';

const NOW = new Date(2026, 8, 5, 12, 0, 0);

function at(
  id: string,
  status: EstabelecimentoStatus,
  paused: boolean,
  close: string,
  deleted: string | null = null,
): Estabelecimento {
  return {
    id,
    status,
    pausado_manualmente: paused,
    excluido_em: deleted,
    horarios: [{ dia_semana: NOW.getDay(), aberto: true, hora_abre: '08:00', hora_fecha: close }],
  } as Estabelecimento;
}

describe('selectStoresForSurface (Story 12.10, Task 2)', () => {
  it('Home/Hub recebem apenas abertas; busca preserva aberta, fechada e pausada', () => {
    const open = at('open', 'ativo', false, '18:00');
    const closed = at('closed', 'ativo', false, '10:00');
    const paused = at('paused', 'ativo', true, '18:00');
    const suspended = at('suspended', 'suspenso', false, '18:00');
    const deletedStore = at('deleted', 'ativo', false, '18:00', '2026-09-05T09:00:00.000Z');

    const purchase = selectStoresForSurface([open, closed, paused, suspended, deletedStore], 'purchase', NOW);
    const search = selectStoresForSurface([open, closed, paused, suspended, deletedStore], 'search', NOW);

    expect(purchase.map(({ loja }) => loja.id)).toEqual(['open']);
    expect(search.map(({ loja }) => loja.id)).toEqual(['open', 'closed', 'paused']);
    expect(search.map(({ disponibilidade }) => disponibilidade.estado)).toEqual(['aberta', 'fechada', 'pausada']);
  });
});
