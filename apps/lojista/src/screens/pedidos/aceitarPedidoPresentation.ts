export function aceitarPedidoSubtitle(itemCount: number, nomeHub: string): string {
  return `${itemCount} ${itemCount === 1 ? 'item' : 'itens'} · ${nomeHub}`;
}
