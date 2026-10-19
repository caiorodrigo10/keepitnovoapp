import type { AdminPaymentInspection } from '@keepit/core-data';

const PAYMENT_STATE_LABEL: Record<AdminPaymentInspection['estado'], string> = {
  criando: 'Criando cobrança',
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  recebido: 'Recebido',
  recusado: 'Recusado',
  expirado: 'Expirado',
  reconciliacao: 'Em reconciliação',
};

export function presentPaymentInspection(inspection: AdminPaymentInspection) {
  const recebido = inspection.valorRecebidoReais !== null;
  return {
    estadoLabel: PAYMENT_STATE_LABEL[inspection.estado],
    valorLabel: recebido ? 'Valor recebido' : 'Valor previsto',
    valorReais: inspection.valorRecebidoReais ?? inspection.valorPrevistoReais,
    recebido,
    pendencia: inspection.pendencia
      ? {
          tentativaId: inspection.pendencia.tentativaId,
          estadoLabel: PAYMENT_STATE_LABEL[inspection.pendencia.estado],
        }
      : null,
  };
}
