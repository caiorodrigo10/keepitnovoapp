import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { loadCartState, saveCartState } from '../lib/cartStorage';
import { shouldConfirmStoreSwitch } from '../lib/cartRules';

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

interface AddItemInput {
  estabelecimentoId: string;
  produtoId: string;
  nome: string;
  precoReais: number;
  quantidade?: number;
  fotoUrl?: string | null;
}

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
  /**
   * `onCommitted` (Story 6.1, AC3) — chamado só quando o item é REALMENTE
   * adicionado (imediatamente, ou depois do cliente confirmar a troca de
   * loja). Não é chamado se o cliente cancelar a confirmação — permite às
   * telas (ex.: `DetalheProduto`) navegar para o Carrinho só após o add
   * ter efeito, em vez de navegar incondicionalmente.
   */
  addItem: (input: AddItemInput, onCommitted?: () => void) => void;
  incrementItem: (produtoId: string) => void;
  decrementItem: (produtoId: string) => void;
  removeItem: (produtoId: string) => void;
  setHubId: (hubId: string) => void;
  setPayment: (selection: PaymentSelection) => void;
  markCpfCollected: () => void;
  addCard: (card: Omit<SavedCard, 'id' | 'padrao'>) => SavedCard;
  /** Limpa carrinho/hub/pagamento após um pedido mock ser "pago" (Task 5/AC3) — mantém `cpfCollected`/`cards` (perfil do cliente, não do pedido). */
  clearOrder: () => void;
  /** Restaura todo o estado efêmero do carrinho para o baseline do cenário demo. */
  resetDemoCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

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
  const [estabelecimentoId, setEstabelecimentoId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [hubId, setHubIdState] = useState<string | null>(null);
  const [payment, setPaymentState] = useState<PaymentSelection | null>(null);
  const [cpfCollected, setCpfCollected] = useState(false);
  // Fix demo Bloco 13 (Caio): começar SEM cartão salvo — o cliente escolhe
  // PIX ou adiciona um cartão do zero (`Pagamento.tsx`/`AdicionarCartao.tsx`
  // já tratam lista vazia). Antes havia um cartão mock pré-cadastrado
  // (`DEFAULT_CARD`, "•••• 4242") que impedia testar esse fluxo.
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [nfSolicitada, setNfSolicitadaState] = useState(false);
  const cardIdCounter = useRef(1);

  const addItem = useCallback(
    (
      { estabelecimentoId: novoEstabelecimentoId, produtoId, nome, precoReais, quantidade = 1, fotoUrl }: AddItemInput,
      onCommitted?: () => void,
    ) => {
      const commit = (limparCarrinhoAnterior: boolean) => {
        setEstabelecimentoId(novoEstabelecimentoId);
        setItems((prevItems) => {
          // Regra fechada "1 pedido = 1 loja" — trocar de loja reinicia o
          // carrinho em vez de misturar itens de dois estabelecimentos.
          // [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md#Rodada 5]
          const base = limparCarrinhoAnterior ? [] : prevItems;
          const existente = base.find((item) => item.produtoId === produtoId);
          if (existente) {
            return base.map((item) =>
              item.produtoId === produtoId ? { ...item, quantidade: item.quantidade + quantidade } : item,
            );
          }
          return [...base, { produtoId, nome, precoSnapshotReais: precoReais, quantidade, fotoUrl }];
        });
        onCommitted?.();
      };

      // Story 6.1 (AC3): trocar de loja com o carrinho atual NÃO-VAZIO exige
      // confirmação explícita ANTES de limpar (antes desta Story a troca
      // acontecia silenciosamente). `shouldConfirmStoreSwitch` é a mesma
      // regra fechada da Rodada 5, extraída como função pura testável.
      if (shouldConfirmStoreSwitch(estabelecimentoId, novoEstabelecimentoId, items.length)) {
        Alert.alert('Trocar de loja?', 'Isso vai limpar seu carrinho atual. Continuar?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', style: 'destructive', onPress: () => commit(true) },
        ]);
        return;
      }

      commit(false);
    },
    [estabelecimentoId, items],
  );

  const incrementItem = useCallback((produtoId: string) => {
    setItems((prev) =>
      prev.map((item) => (item.produtoId === produtoId ? { ...item, quantidade: item.quantidade + 1 } : item)),
    );
  }, []);

  const decrementItem = useCallback((produtoId: string) => {
    setItems((prev) =>
      prev
        .map((item) => (item.produtoId === produtoId ? { ...item, quantidade: item.quantidade - 1 } : item))
        .filter((item) => item.quantidade > 0),
    );
  }, []);

  const removeItem = useCallback((produtoId: string) => {
    setItems((prev) => prev.filter((item) => item.produtoId !== produtoId));
  }, []);

  const setHubId = useCallback((id: string) => setHubIdState(id), []);
  const setPayment = useCallback((selection: PaymentSelection) => setPaymentState(selection), []);
  const markCpfCollected = useCallback(() => setCpfCollected(true), []);
  const setNfSolicitada = useCallback((value: boolean) => setNfSolicitadaState(value), []);

  const addCard = useCallback((card: Omit<SavedCard, 'id' | 'padrao'>) => {
    const novo: SavedCard = { ...card, id: `card-mock-${cardIdCounter.current++}`, padrao: false };
    setCards((prev) => [...prev, novo]);
    return novo;
  }, []);

  const clearOrder = useCallback(() => {
    setEstabelecimentoId(null);
    setItems([]);
    setHubIdState(null);
    setPaymentState(null);
  }, []);

  const resetDemoCart = useCallback(() => {
    setEstabelecimentoId(null);
    setItems([]);
    setHubIdState(null);
    setPaymentState(null);
    setCpfCollected(false);
    setCards([]);
    setNfSolicitadaState(false);
    cardIdCounter.current = 1;
  }, []);

  const subtotalReais = useMemo(
    () => items.reduce((total, item) => total + item.precoSnapshotReais * item.quantidade, 0),
    [items],
  );

  // Persistência via AsyncStorage (Story 6.1, AC3) — o carrinho sobrevive a
  // fechar/reabrir o app no mesmo aparelho. `hydratedRef` evita que o efeito
  // de escrita rode ANTES da leitura inicial terminar (o que sobrescreveria
  // um carrinho salvo com o estado inicial vazio). Fail-open: erro de
  // leitura/escrita (ver `lib/cartStorage.ts`) nunca trava a tela.
  const hydratedRef = useRef(false);

  useEffect(() => {
    let ativo = true;
    loadCartState().then((persisted) => {
      if (!ativo) {
        return;
      }
      if (persisted) {
        setEstabelecimentoId(persisted.estabelecimentoId);
        setItems(persisted.items);
        setHubIdState(persisted.hubId);
        setPaymentState(persisted.payment);
      }
      hydratedRef.current = true;
    });
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    saveCartState({ estabelecimentoId, items, hubId, payment });
  }, [estabelecimentoId, items, hubId, payment]);

  const value = useMemo<CartContextValue>(
    () => ({
      estabelecimentoId,
      items,
      hubId,
      payment,
      cpfCollected,
      cards,
      nfSolicitada,
      setNfSolicitada,
      subtotalReais,
      addItem,
      incrementItem,
      decrementItem,
      removeItem,
      setHubId,
      setPayment,
      markCpfCollected,
      addCard,
      clearOrder,
      resetDemoCart,
    }),
    [
      estabelecimentoId,
      items,
      hubId,
      payment,
      cpfCollected,
      cards,
      nfSolicitada,
      setNfSolicitada,
      subtotalReais,
      addItem,
      incrementItem,
      decrementItem,
      removeItem,
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
