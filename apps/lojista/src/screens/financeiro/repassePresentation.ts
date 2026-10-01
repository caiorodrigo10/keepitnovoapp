import type { Repasse } from '@keepit/core-data';

const LABEL: Record<Repasse['estado'], string> = {
  previsto: 'Previsto', pendente: 'Aguardando pagamento', em_analise: 'Em análise',
  pago: 'Pago', compensado: 'Compensado', invalidado: 'Invalidado',
};

/** Estado exibido vem exclusivamente do estado persistido, nunca da data de vencimento. */
export function repasseLabel(estado: Repasse['estado']): string { return LABEL[estado]; }

export function nextRepasse(repasses: Repasse[], estabelecimentoId: string): Repasse | null {
  return repasses.filter((item) => item.estabelecimentoId === estabelecimentoId &&
    ['previsto', 'pendente', 'em_analise'].includes(item.estado))
    .sort((a, b) => a.previstoPara.localeCompare(b.previstoPara))[0] ?? null;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function shortDate(date: string): string { const [, month, day] = date.split('-'); return `${day}/${month}`; }
export function semanaLabel(semanaInicio: string): string {
  return `${shortDate(semanaInicio)} a ${shortDate(addDays(semanaInicio, 6))}`;
}
export function dateLabel(date: string): string { const [year, month, day] = date.split('-'); return `${day}/${month}/${year}`; }
