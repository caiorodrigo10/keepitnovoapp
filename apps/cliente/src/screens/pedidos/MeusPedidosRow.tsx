import type { Pedido } from '@keepit/core-data';

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
 */
export function MeusPedidosRow({ pedido, onPress }: MeusPedidosRowProps) {
  const { data: estabelecimento } = useStoreDetail(pedido.estabelecimento_id);

  return (
    <PedidoCard
      pedido={pedido}
      estabelecimentoNome={estabelecimento?.nome_fantasia ?? '...'}
      onPress={() => onPress(pedido)}
    />
  );
}
