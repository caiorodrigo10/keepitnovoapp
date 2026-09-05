import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Hub } from '@keepit/core-data';

import { loadCartState, saveCartState } from '../lib/cartStorage';
import {
  planHubSelection,
  planItemAddition,
  type AddItemInput,
  type CartOrderState,
  type CartTransition,
} from '../lib/cartRules';
import { executeCartTransition, type CartMutationResult } from '../lib/cartTransaction';

/**
 * Item do carrinho local (Story 0.6) — espelha `carrinho_itens`
 * (`produto_id`, `quantidade`, `preco_snapshot_reais`: preço CONGELADO no
 * momento do add, não o preço atual do produto).
 * [Source: docs/architecture/03-data-models.md#4. Carrinho]
 */
export interface CartItem {
  produtoId: string;
  nome: string;
  precoSnapshotReais: number;
  quantidade: number;
  /** `produto.foto_url` no momento do add (Fix demo Bloco 13) — sem isso o CartItemRow não tem foto pra exibir e cai no placeholder cinza. */
  fotoUrl?: string | null;
}

/**
 * Cartão salvo mock — espelha `clientes_cartoes` (`ultimo4`, `bandeira`,
 * `nome_no_cartao`, `padrao`), sem `asaas_credit_card_token` (não aplicável
 * ao Épico 0, sem Asaas).
 * [Source: docs/architecture/03-data-models.md#1.3 clientes_cartoes]
 */
export interface SavedCard {
  id: string;
  ultimo4: string;
  bandeira: string;
  nomeNoCartao: string;
  padrao: boolean;
}

export type PaymentSelection = { type: 'pix' } | { type: 'cartao'; cardId: string };

interface CartContextValue {
  estabelecimentoId: string | null;
  items: CartItem[];
  hubId: string | null;
  payment: PaymentSelection | null;
  cpfCollected: boolean;
  cards: SavedCard[];
  /**
   * Intenção de nota fiscal (Story 6.2, AC6) — checkbox "Solicitar nota
   * fiscal" no Checkout. NÃO cria pedido nem persiste em
   * `pedidos.nf_solicitada` (tabela `pedidos` ainda não existe nas
   * migrations aplicadas — fronteira do bloco). Fica em `CartContext` até a
   * criação real do pedido (Story 6.6+/Épico 7) herdar esse valor.
   */
  nfSolicitada: boolean;
  setNfSolicitada: (value: boolean) => void;
  subtotalReais: number;
  addItem: (input: AddItemInput, confirmed?: boolean) => Promise<CartMutationResult>;
  incrementItem: (produtoId: string) => Promise<CartMutationResult>;
  decrementItem: (produtoId: string) => Promise<CartMutationResult>;
  removeItem: (produtoId: string) => Promise<CartMutationResult>;
  selectHub: (hub: Pick<Hub, 'id' | 'ativo'>, confirmed?: boolean) => Promise<CartMutationResult>;
  /** Compatibilidade temporária para telas migradas na próxima task. */
  setHubId: (hubId: string) => Promise<CartMutationResult>;
  setPayment: (selection: PaymentSelection) => Promise<CartMutationResult>;
  markCpfCollected: () => void;
  addCard: (card: Omit<SavedCard, 'id' | 'padrao'>) => SavedCard;
  /** Limpa carrinho/hub/pagamento após um pedido mock ser "pago" (Task 5/AC3) — mantém `cpfCollected`/`cards` (perfil do cliente, não do pedido). */
  clearOrder: () => Promise<CartMutationResult>;
  /** Restaura todo o estado efêmero do carrinho para o baseline do cenário demo. */
  resetDemoCart: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

const EMPTY_ORDER_STATE: CartOrderState = {
  estabelecimentoId: null,
  items: [],
  hubId: null,
  payment: null,
};

/**
 * [IDS] Decisão FINAL (Story 1.10, Task 8 — reavaliação formal do gap
 * registrado na Story 0.6): manter o carrinho + cartão salvo como estado
 * client-side LOCAL, sem criar `cart.port`.
 *
 * REUSE avaliado: `order.port.create()` já cobre a criação do PEDIDO final
 * — não cobre "carrinho" (rascunho pré-checkout). Rejeitado, capacidade
 * não existe.
 * ADAPT avaliado: estender alguma port existente com `carrinho`/
 * `carrinho_itens`/`clientes_cartoes`. Rejeitado — nenhuma port do Épico 0
 * modela um "rascunho" (todas modelam entidades PERSISTIDAS pelo backend).
 * CREATE avaliado (`cart.port` novo): rejeitado por decisão de produto, não
 * por restrição de escopo — carrinho é, por natureza, um formulário
 * client-side efêmero (equivalente a um rascunho de compra), sem
 * requisito de sincronizar entre dispositivos no MVP (não há necessidade
 * de negócio para o cliente retomar o carrinho a partir de outro
 * aparelho). Modelá-lo como port real introduziria uma fronteira
 * mock→Supabase para um dado que nunca precisa sobreviver além da sessão
 * do app, sem ganho correspondente — contrário ao princípio de "poucas
 * ports" do Épico 0. Cartão salvo (`SavedCard`) segue a mesma decisão:
 * é dado de perfil de pagamento, mas sem Asaas real no MVP (Épico 0) não
 * há um alvo de persistência que justifique promovê-lo agora; revisar
 * junto com a integração de pagamento real (Épico 1+).
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [orderState, setOrderState] = useState<CartOrderState>(EMPTY_ORDER_STATE);
  const stateRef = useRef<CartOrderState>(EMPTY_ORDER_STATE);
  const [cpfCollected, setCpfCollected] = useState(false);
  // Fix demo Bloco 13 (Caio): começar SEM cartão salvo — o cliente escolhe
  // PIX ou adiciona um cartão do zero (`Pagamento.tsx`/`AdicionarCartao.tsx`
  // já tratam lista vazia). Antes havia um cartão mock pré-cadastrado
  // (`DEFAULT_CARD`, "•••• 4242") que impedia testar esse fluxo.
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [nfSolicitada, setNfSolicitadaState] = useState(false);
  const cardIdCounter = useRef(1);

  const resolveHydrationRef = useRef<(() => void) | null>(null);
  const hydrationPromiseRef = useRef<Promise<void> | null>(null);
  if (!hydrationPromiseRef.current) {
    hydrationPromiseRef.current = new Promise((resolve) => {
      resolveHydrationRef.current = resolve;
    });
  }
  const queueRef = useRef<Promise<void>>(hydrationPromiseRef.current);

  const applyTransition = useCallback(
    (plan: (current: CartOrderState) => CartTransition): Promise<CartMutationResult> => {
      const operation = queueRef.current.then(async () => {
        const current = stateRef.current;
        const result = await executeCartTransition(current, plan(current), saveCartState);
        if (result.status === 'committed') {
          stateRef.current = result.state;
          setOrderState(result.state);
        }
        return result;
      });
      queueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [],
  );

  const addItem = useCallback(
    (input: AddItemInput, confirmed = false) =>
      applyTransition((current) => planItemAddition(current, input, confirmed)),
    [applyTransition],
  );

  const incrementItem = useCallback(
    (produtoId: string) =>
      applyTransition((current) => ({
        kind: 'ready',
        next: {
          ...current,
          items: current.items.map((item) =>
            item.produtoId === produtoId ? { ...item, quantidade: item.quantidade + 1 } : item,
          ),
        },
      })),
    [applyTransition],
  );

  const decrementItem = useCallback(
    (produtoId: string) =>
      applyTransition((current) => ({
        kind: 'ready',
        next: {
          ...current,
          items: current.items
            .map((item) =>
              item.produtoId === produtoId ? { ...item, quantidade: item.quantidade - 1 } : item,
            )
            .filter((item) => item.quantidade > 0),
        },
      })),
    [applyTransition],
  );

  const removeItem = useCallback(
    (produtoId: string) =>
      applyTransition((current) => ({
        kind: 'ready',
        next: { ...current, items: current.items.filter((item) => item.produtoId !== produtoId) },
      })),
    [applyTransition],
  );

  const selectHub = useCallback(
    (hub: Pick<Hub, 'id' | 'ativo'>, confirmed = false) =>
      applyTransition((current) => planHubSelection(current, hub, confirmed)),
    [applyTransition],
  );

  const setHubId = useCallback(
    (id: string) =>
      applyTransition((current) => ({ kind: 'ready', next: { ...current, hubId: id } })),
    [applyTransition],
  );

  const setPayment = useCallback(
    (selection: PaymentSelection) =>
      applyTransition((current) => ({ kind: 'ready', next: { ...current, payment: selection } })),
    [applyTransition],
  );
  const markCpfCollected = useCallback(() => setCpfCollected(true), []);
  const setNfSolicitada = useCallback((value: boolean) => setNfSolicitadaState(value), []);

  const addCard = useCallback((card: Omit<SavedCard, 'id' | 'padrao'>) => {
    const novo: SavedCard = { ...card, id: `card-mock-${cardIdCounter.current++}`, padrao: false };
    setCards((prev) => [...prev, novo]);
    return novo;
  }, []);

  const clearOrder = useCallback(
    () => applyTransition(() => ({ kind: 'ready', next: EMPTY_ORDER_STATE })),
    [applyTransition],
  );

  const resetDemoCart = useCallback(async () => {
    setCpfCollected(false);
    setCards([]);
    setNfSolicitadaState(false);
    cardIdCounter.current = 1;
    await applyTransition(() => ({ kind: 'ready', next: EMPTY_ORDER_STATE }));
  }, [applyTransition]);

  const subtotalReais = useMemo(
    () => orderState.items.reduce((total, item) => total + item.precoSnapshotReais * item.quantidade, 0),
    [orderState.items],
  );

  // Persistência via AsyncStorage (Story 6.1, AC3) — o carrinho sobrevive a
  // fechar/reabrir o app no mesmo aparelho. A hidratação ocupa a primeira
  // posição da fila: nenhuma mutação lê/publica estado antes dela terminar.
  useEffect(() => {
    let ativo = true;
    loadCartState()
      .then((persisted) => {
        if (!ativo) {
          return;
        }
        if (persisted) {
          stateRef.current = persisted;
          setOrderState(persisted);
        }
      })
      .finally(() => {
        if (ativo) {
          resolveHydrationRef.current?.();
          resolveHydrationRef.current = null;
        }
      });
    return () => {
      ativo = false;
    };
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      estabelecimentoId: orderState.estabelecimentoId,
      items: orderState.items,
      hubId: orderState.hubId,
      payment: orderState.payment,
      cpfCollected,
      cards,
      nfSolicitada,
      setNfSolicitada,
      subtotalReais,
      addItem,
      incrementItem,
      decrementItem,
      removeItem,
      selectHub,
      setHubId,
      setPayment,
      markCpfCollected,
      addCard,
      clearOrder,
      resetDemoCart,
    }),
    [
      orderState,
      cpfCollected,
      cards,
      nfSolicitada,
      setNfSolicitada,
      subtotalReais,
      addItem,
      incrementItem,
      decrementItem,
      removeItem,
      selectHub,
      setHubId,
      setPayment,
      markCpfCollected,
      addCard,
      clearOrder,
      resetDemoCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart() precisa ser usado dentro de <CartProvider>.');
  }
  return ctx;
}
