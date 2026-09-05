import type { AdvanceableStatus, DataClient, Pedido } from '@keepit/core-data';

export type QaOrderAction =
  | { kind: 'accept'; label: string }
  | { kind: 'confirm-pin'; label: string }
  | { kind: 'override'; status: AdvanceableStatus; label: string };

export function getNextQaOrderAction(pedido: Pedido): QaOrderAction | null {
  switch (pedido.status) {
    case 'aguardando_aceite':
      return { kind: 'accept', label: 'Aceitar pedido' };
    case 'aceito':
      return { kind: 'override', status: 'em_preparo', label: 'Em preparo' };
    case 'em_preparo':
      return { kind: 'override', status: 'saindo_hub', label: 'Saindo para o hub' };
    case 'saindo_hub':
      return { kind: 'override', status: 'no_hub', label: 'Pronto no hub' };
    case 'no_hub':
      return { kind: 'confirm-pin', label: 'Confirmar entrega' };
    default:
      return null;
  }
}

export async function advanceOrderForQa(client: DataClient, pedido: Pedido): Promise<Pedido | null> {
  const action = getNextQaOrderAction(pedido);
  if (!action) {
    return null;
  }
  if (action.kind === 'accept') {
    return client.order.accept(pedido.id, 15);
  }
  if (action.kind === 'confirm-pin') {
    return client.order.confirmPin(pedido.id, pedido.pin_texto);
  }
  return client.order.advanceStatus(pedido.id, action.status);
}
