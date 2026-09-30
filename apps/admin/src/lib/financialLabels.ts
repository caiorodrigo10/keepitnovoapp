export function anticipationIdentityLabel(input: {
  anticipationId: string;
  paymentId: string;
  orderId: string;
}): string {
  return `Antecipação ${input.anticipationId} · Cobrança ${input.paymentId} · Pedido ${input.orderId}`;
}
