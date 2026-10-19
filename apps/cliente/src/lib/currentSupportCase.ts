import type { SupportCase } from '@keepit/core-data';

/** Seleciona pelo instante de abertura, sem depender da ordenação do adapter. */
export function currentSupportCase(cases: SupportCase[], pedidoId: string): SupportCase | null {
  return cases.filter((item) => item.pedidoId === pedidoId).reduce<SupportCase | null>((current, item) => {
    if (!current) return item;
    if (item.criadoEm > current.criadoEm) return item;
    if (item.criadoEm === current.criadoEm && item.id > current.id) return item;
    return current;
  }, null);
}
