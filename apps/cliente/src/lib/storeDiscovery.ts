import {
  resolveLojaDisponibilidade,
  type Estabelecimento,
  type LojaDisponibilidade,
} from '@keepit/core-data';

export interface LojaComDisponibilidade {
  loja: Estabelecimento;
  disponibilidade: LojaDisponibilidade;
}

export type StoreSurface = 'purchase' | 'search';

export function selectStoresForSurface(
  stores: Estabelecimento[],
  surface: StoreSurface,
  now: Date = new Date(),
): LojaComDisponibilidade[] {
  return stores
    .map((loja) => ({
      loja,
      disponibilidade: resolveLojaDisponibilidade(loja, now),
    }))
    .filter(({ disponibilidade }) =>
      surface === 'purchase' ? disponibilidade.disponivelParaCompra : disponibilidade.visivelAoCliente,
    );
}
