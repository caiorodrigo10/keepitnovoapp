import type { Saque } from '@keepit/core-data';

/** Histórico de PIX efetivamente concluído, pelo mês da confirmação. */
export function paidThisMonth(saques: Saque[], now = new Date()): number {
  return saques.filter((saque) => {
    if (saque.status !== 'concluido' || !saque.concluido_em) return false;
    const paid = new Date(saque.concluido_em);
    return paid.getUTCFullYear() === now.getUTCFullYear() && paid.getUTCMonth() === now.getUTCMonth();
  }).reduce((sum, saque) => sum + saque.valor_reais, 0);
}
