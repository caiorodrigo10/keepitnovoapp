import type { Pedido } from '@keepit/core-data';

import { useHubDetail } from '../../hooks/useHubDetail';
import { useStoreDetail } from '../../hooks/useStoreDetail';
import { PedidoCard } from '../../components/pedidos';

interface MeusPedidosRowProps {
  pedido: Pedido;
  onPress: (pedido: Pedido) => void;
}

/**
 * [IDS] CREATE — wrapper fino que resolve o nome do estabelecimento
 * (`useStoreDetail`, Story 0.5) para alimentar `PedidoCard`. Isolado num
 * componente próprio (em vez de chamar o hook dentro de um `.map()` no
 * corpo de `MeusPedidos`) para respeitar a Rule of Hooks — cada card é um
 * componente, então cada um pode ter seu próprio hook.
 *
 * Story 6.7.1 (AC6) — [IDS] ADAPT: passa a resolver também o nome real do
 * hub via `useHubDetail` (mesmo hook já usado por `ModalConfirmarPin.tsx`,
 * Story 6.7), mesmo padrão de composição já usado acima para
 * `estabelecimentoNome` — fecha o gap do hardcode em `PedidoCard.tsx`.
 */
export function MeusPedidosRow({ pedido, onPress }: MeusPedidosRowProps) {
  const { data: estabelecimento } = useStoreDetail(pedido.estabelecimento_id);
  const { data: hub } = useHubDetail(pedido.hub_id);

  return (
    <PedidoCard
      pedido={pedido}
      estabelecimentoNome={estabelecimento?.nome_fantasia ?? '...'}
      hubNome={hub?.nome ?? '...'}
      onPress={() => onPress(pedido)}
    />
  );
}
