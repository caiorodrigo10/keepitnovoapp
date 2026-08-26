import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { getDataClient, PinBloqueadoError, PinIncorretoError, type Pedido } from '@keepit/core-data';

import { CURRENT_ESTABELECIMENTO_ID, CURRENT_HUB_ID } from '../catalogo/currentStore';

/**
 * Fallback do "tempo médio de preparo" (Task 3) — tenta
 * `store.port.getById(CURRENT_ESTABELECIMENTO_ID).tempo_medio_entrega_min`
 * (campo real do schema, `estabelecimentos`); se a chamada falhar por
 * qualquer razão, cai para este valor — não há um valor de negócio mais
 * específico para "tempo médio de preparo" em `@keepit/config` hoje.
 */
const FALLBACK_TEMPO_PREPARO_MIN = 10;

/** Nome de exibição padrão enquanto `AuthPort.getById` ainda não resolveu o cliente. */
const NOME_CLIENTE_FALLBACK = 'Cliente';

/** Nome do hub padrão enquanto `HubPort.getById` ainda não resolveu (Story 1.10, Task 1). */
const HUB_NOME_FALLBACK = 'Hub Centro';

/** Status finais — pedido sai de "Ativos" e passa para "Concluídos" (Task 8). */
const STATUS_CONCLUIDOS = new Set([
  'entregue',
  'recusado',
  'nao_retirado',
  'cancelado',
  'cancelado_timeout',
  'cancelado_atraso',
  'cancelado_admin',
  'nao_entregue_lojista',
  'estornado_chargeback',
]);

/**
 * Story 6.15 (AC5) — [IDS] CREATE: substitui o antigo `{ pedido, correto:
 * boolean }` (que colapsava "PIN incorreto" e "bloqueado" na mesma
 * mensagem genérica — gap confirmado no Dev Notes da Story). `motivo`
 * distingue os dois desfechos de erro para `DigitarPin.tsx` mostrar o texto
 * honesto certo; `tentativasRestantes`/`bloqueadoAte` vêm direto de
 * `PinIncorretoError`/`PinBloqueadoError` (`@keepit/core-data`), mesmas
 * classes lançadas por `order.mock.ts` e `order.supabase.ts` (paridade).
 */
export type ConfirmPinResult =
  | { pedido: Pedido; correto: true }
  | { pedido: Pedido; correto: false; motivo: 'incorreto'; tentativasRestantes: number }
  | { pedido: Pedido; correto: false; motivo: 'bloqueado'; bloqueadoAte: string };

interface OrdersContextValue {
  ativos: Pedido[];
  concluidos: Pedido[];
  loading: boolean;
  error: Error | null;
  reload: () => void;
  getById: (id: string) => Pedido | undefined;
  /** Prefill de "Aceitar pedido" (Task 3) — `estabelecimentos.tempo_medio_entrega_min` real, com fallback documentado. */
  tempoMedioPrepMin: number;
  /** Nome do hub (Story 1.10, Task 1) — promovido de `CURRENT_HUB.nome` (`lojistaOrders.mock.ts`, Story 0.10). */
  hubNome: string;
  /** Nome de exibição do cliente (Story 1.10, Task 3) — promovido de `nomeClienteDisplay`/`CLIENTE_NOME_POR_ID`. */
  nomeCliente: (clienteId: string) => string;
  acceptOrder: (pedidoId: string, tempoEstimadoMin: number) => Promise<Pedido>;
  refuseOrder: (pedidoId: string, motivo: string) => Promise<Pedido>;
  markReadyForHub: (pedidoId: string) => Promise<Pedido>;
  markArrivedAtHub: (pedidoId: string) => Promise<Pedido>;
  confirmPin: (pedidoId: string, pin: string) => Promise<ConfirmPinResult>;
  markCustomerNoShow: (pedidoId: string, motivo: string) => Promise<Pedido>;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

/**
 * Provider da máquina de estados de pedidos do lado lojista — Story 0.10
 * (Task 1), religado para `client.order` (via `getDataClient()`) na Story
 * 1.10 (Task 1): `lojistaOrders.mock.ts` foi removido, esta é a fronteira
 * mock->real única a partir de agora.
 */
export function OrdersProvider({ children }: PropsWithChildren) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [tempoMedioPrepMin, setTempoMedioPrepMin] = useState<number>(FALLBACK_TEMPO_PREPARO_MIN);
  const [hubNome, setHubNome] = useState<string>(HUB_NOME_FALLBACK);
  const [clienteNomes, setClienteNomes] = useState<Record<string, string>>({});
  const clienteNomesResolvidos = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getDataClient()
      .order.listByEstabelecimento(CURRENT_ESTABELECIMENTO_ID)
      .then((lista) => {
        if (!cancelled) setPedidos(lista);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    getDataClient()
      .store.getById(CURRENT_ESTABELECIMENTO_ID)
      .then((estabelecimento) => {
        if (!cancelled && estabelecimento) {
          setTempoMedioPrepMin(estabelecimento.tempo_medio_entrega_min);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDataClient()
      .hub.getById(CURRENT_HUB_ID)
      .then((hub) => {
        if (!cancelled && hub) setHubNome(hub.nome);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const pendentes = [...new Set(pedidos.map((p) => p.cliente_id))].filter(
      (clienteId) => !clienteNomesResolvidos.current.has(clienteId),
    );
    if (pendentes.length === 0) return;

    let cancelled = false;
    Promise.all(
      pendentes.map((clienteId) =>
        getDataClient()
          .auth.getById(clienteId)
          .then((cliente) => [clienteId, cliente?.nome ?? null] as const)
          .catch(() => [clienteId, null] as const),
      ),
    ).then((resultados) => {
      if (cancelled) return;
      setClienteNomes((previous) => {
        const next = { ...previous };
        for (const [clienteId, nome] of resultados) {
          clienteNomesResolvidos.current.add(clienteId);
          if (nome) next[clienteId] = nome;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pedidos]);

  function upsert(pedido: Pedido) {
    setPedidos((previous) => previous.map((item) => (item.id === pedido.id ? pedido : item)));
  }

  const value = useMemo<OrdersContextValue>(() => {
    const ativos = pedidos.filter((p) => !STATUS_CONCLUIDOS.has(p.status));
    const concluidos = pedidos.filter((p) => STATUS_CONCLUIDOS.has(p.status));

    return {
      ativos,
      concluidos,
      loading,
      error,
      reload: () => setReloadToken((token) => token + 1),
      getById: (id) => pedidos.find((p) => p.id === id),
      tempoMedioPrepMin,
      hubNome,
      nomeCliente: (clienteId: string) => clienteNomes[clienteId] ?? NOME_CLIENTE_FALLBACK,
      async acceptOrder(pedidoId, tempoEstimadoMin) {
        const pedido = await getDataClient().order.accept(pedidoId, tempoEstimadoMin);
        upsert(pedido);
        return pedido;
      },
      async refuseOrder(pedidoId, motivo) {
        const pedido = await getDataClient().order.refuse(pedidoId, motivo);
        upsert(pedido);
        return pedido;
      },
      async markReadyForHub(pedidoId) {
        const pedido = await getDataClient().order.markReadyForHub(pedidoId);
        upsert(pedido);
        return pedido;
      },
      async markArrivedAtHub(pedidoId) {
        const pedido = await getDataClient().order.markArrivedAtHub(pedidoId);
        upsert(pedido);
        return pedido;
      },
      /**
       * Story 6.15 (AC5) — [IDS] ADAPT: antes capturava QUALQUER erro e
       * respondia sempre `{ correto: false }` (gap confirmado — colapsava
       * "PIN incorreto" e "bloqueado" na mesma mensagem genérica em
       * `DigitarPin.tsx`). Agora distingue por `instanceof`
       * `PinIncorretoError`/`PinBloqueadoError` (mesmas classes lançadas
       * por `order.mock.ts`/`order.supabase.ts` — paridade). Não chama mais
       * `order.getById` no catch (ainda `NotImplementedError` no adapter
       * Supabase, fora do escopo desta Story) — o `pedido` retornado no
       * erro é o último estado local conhecido; a UI só precisa dele para o
       * resumo do card, não para `tentativas_pin`/`pin_bloqueado_ate` (que
       * vêm do próprio erro). Qualquer outro erro (estrutural —
       * `AUTENTICACAO_NECESSARIA`/`PEDIDO_NAO_ENCONTRADO`/`ACESSO_NEGADO`/
       * `ESTADO_INVALIDO`) continua propagando, não é engolido.
       */
      async confirmPin(pedidoId, pin) {
        try {
          const pedido = await getDataClient().order.confirmPin(pedidoId, pin);
          upsert(pedido);
          return { pedido, correto: true };
        } catch (err) {
          const pedidoAtual = pedidos.find((p) => p.id === pedidoId);
          if (!pedidoAtual) throw new Error(`[lojista] Pedido não encontrado: ${pedidoId}`);

          if (err instanceof PinBloqueadoError) {
            return { pedido: pedidoAtual, correto: false, motivo: 'bloqueado', bloqueadoAte: err.bloqueadoAte };
          }
          if (err instanceof PinIncorretoError) {
            return {
              pedido: pedidoAtual,
              correto: false,
              motivo: 'incorreto',
              tentativasRestantes: err.tentativasRestantes,
            };
          }
          throw err;
        }
      },
      async markCustomerNoShow(pedidoId, motivo) {
        const pedido = await getDataClient().order.markCustomerNoShow(pedidoId, motivo);
        upsert(pedido);
        return pedido;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos, loading, error, tempoMedioPrepMin, hubNome, clienteNomes]);

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrdersContext(): OrdersContextValue {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error('useOrdersContext deve ser usado dentro de <OrdersProvider>.');
  }
  return context;
}
