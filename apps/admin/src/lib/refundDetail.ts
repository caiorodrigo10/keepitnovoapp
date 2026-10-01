import { remainingRefund, type DataClient } from '@keepit/core-data';

/** Carrega o contexto disponível sem inventar pedido para lançamentos órfãos. */
export async function loadRefundDetail(client: Pick<DataClient, 'admin' | 'order'>, refundId: string) {
  const reembolsos = await client.admin.refundQueue.list();
  const reembolso = reembolsos.find((item) => item.id === refundId) ?? null;
  if (!reembolso || !reembolso.pedido_id) {
    return { reembolso, pedido: null, payment: null, restanteCentavos: null };
  }

  const [pedido, payment] = await Promise.all([
    client.order.getById(reembolso.pedido_id),
    client.admin.inspectPayment(reembolso.pedido_id),
  ]);
  if (!pedido) return { reembolso, pedido: null, payment, restanteCentavos: null };

  const relacionados = reembolsos.filter((item) => item.pedido_id === pedido.id);
  const concluido = relacionados.filter((item) => item.status === 'estornado')
    .reduce((sum, item) => sum + Math.round(item.valor_a_estornar_reais * 100), 0);
  const reservado = relacionados.filter((item) => item.status !== 'estornado')
    .reduce((sum, item) => sum + Math.round(item.valor_a_estornar_reais * 100), 0);
  const restanteCentavos = remainingRefund(Math.round(pedido.total_pago_reais * 100), concluido, reservado);

  return { reembolso, pedido, payment, restanteCentavos };
}
