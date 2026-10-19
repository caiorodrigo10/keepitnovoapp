import type { FinancialPendingAdmin } from '@keepit/core-data';

export function anticipationIdentityLabel(input: {
  anticipationId: string;
  paymentId: string;
  orderId: string;
}): string {
  return `Antecipação ${input.anticipationId} · Cobrança ${input.paymentId} · Pedido ${input.orderId}`;
}

function elapsedBusinessDays(openedAt: Date, now: Date): number {
  if (!Number.isFinite(openedAt.getTime()) || openedAt >= now) return 0;
  const cursor = new Date(Date.UTC(openedAt.getUTCFullYear(), openedAt.getUTCMonth(), openedAt.getUTCDate()));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let count = 0;
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

export function presentFinancialPending(item: FinancialPendingAdmin, now = new Date()) {
  const businessDays = elapsedBusinessDays(new Date(item.abertoEm), now);
  const entityId = item.id.slice(item.id.indexOf(':') + 1);
  const action = {
    reconciliar_pagamento: { acaoLabel: 'Reconciliar pagamento', acaoHref: null },
    reconciliar_validacao_cartao: { acaoLabel: 'Reconciliar validação do cartão', acaoHref: null },
    consultar_divergencia: {
      acaoLabel: item.pedidoId ? 'Inspecionar pedido' : 'Escalar sem vínculo',
      acaoHref: item.pedidoId ? `/pedidos/${encodeURIComponent(item.pedidoId)}` : '#escalonamento-sem-vinculo',
    },
    tratar_reembolso: { acaoLabel: 'Tratar reembolso', acaoHref: `/reembolsos/${entityId}` },
    revisar_repasse: { acaoLabel: 'Revisar repasse', acaoHref: `/repasses/${entityId}` },
  }[item.acaoPermitida];
  return {
    idadeLabel: businessDays === 0 ? 'aberta hoje' : `${businessDays} ${businessDays === 1 ? 'dia útil' : 'dias úteis'}`,
    atrasada: businessDays > 1,
    ...action,
  };
}
