/** Somente demonstração explícita: estável entre sessões, nunca usado no Supabase. */
export function mockPedidoPin(pedidoId: string): string {
  let hash = 0;
  for (let i = 0; i < pedidoId.length; i++) hash = (hash * 31 + pedidoId.charCodeAt(i)) % 9000;
  return String(1000 + hash);
}
