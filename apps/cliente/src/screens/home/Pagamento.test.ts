import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ quoteInput: null as unknown }));

vi.mock('react-native', () => ({ StyleSheet: { create: (value: unknown) => value }, Text: 'span', View: 'div', Pressable: 'button' }));
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: vi.fn() }) }));
vi.mock('@keepit/core-data', () => ({ getDataClient: vi.fn() }));
vi.mock('@keepit/ui-tokens', () => ({ lightColors: { text: { tertiary: '#999' }, accent: { successFg: '#0f0', warning: '#f00' } }, spacing: { 2: 2, 3: 3, 6: 6 }, typography: { sizes: { xs: { fontSize: 1 }, sm: { fontSize: 1 }, md: { fontSize: 1 } } } }));
vi.mock('../../components/checkout', () => ({ SelectableRow: 'button' }));
vi.mock('../../components/ui', () => ({ AppHeader: () => null, Button: () => null, Screen: ({ children }: { children: unknown }) => children }));
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({
    estabelecimentoId: 'loja-1', hubId: 'hub-1', payment: null, nfSolicitada: false,
    items: [
      { produtoId: 'produto-1', nome: 'Produto 1', precoSnapshotReais: 10, quantidade: 2, complementoIds: ['tam-grande', 'bacon'] },
      { produtoId: 'produto-2', nome: 'Produto 2', precoSnapshotReais: 20, quantidade: 1, complementoIds: ['extra-2'] },
    ],
    clearPayment: vi.fn(), clearOrder: vi.fn(), setPayment: vi.fn(),
  }),
}));
vi.mock('../../hooks/useCotacao', () => ({ useCotacao: (input: unknown) => { state.quoteInput = input; return { data: null, loading: true, error: null, refresh: vi.fn() }; } }));
vi.mock('../../hooks/useCurrentCliente', () => ({ useCurrentCliente: () => ({ data: null }) }));
vi.mock('../../hooks/useSavedCards', () => ({ useSavedCards: () => ({ loading: true, cards: [] }) }));
vi.mock('../../hooks/useStoreDetail', () => ({ useStoreDetail: () => ({ data: undefined, loading: true }) }));
vi.mock('../../lib/checkoutTotals', () => ({ checkoutTotalsFromQuote: vi.fn() }));
vi.mock('../../lib/checkoutValidation', () => ({ canCheckoutStore: () => true, getCheckoutStoreBlockMessage: () => null, loadCheckoutStoreForSubmission: vi.fn() }));
vi.mock('../../lib/dataSource', () => ({ isSupabaseDataSource: () => false }));
vi.mock('../../lib/ordersResource', () => ({ invalidatePedidos: vi.fn() }));
vi.mock('../../lib/paymentSubmission', () => ({ createPaymentSubmissionController: () => ({ getPendingTarget: () => null, submit: vi.fn() }) }));
vi.mock('../../config/featureFlags', () => ({ CARD_TOKENIZATION_ENABLED: false }));

import Pagamento from './Pagamento';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;

afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});

describe('Pagamento', () => {
  it('cota cada item do carrinho com seus próprios complementoIds', async () => {
    await act(async () => {
      renderer = create(React.createElement(Pagamento, { navigation: { navigate: vi.fn() } } as never));
    });

    expect(state.quoteInput).toEqual({
      estabelecimentoId: 'loja-1',
      hubId: 'hub-1',
      itens: [
        { produtoId: 'produto-1', quantidade: 2, complementoIds: ['tam-grande', 'bacon'] },
        { produtoId: 'produto-2', quantidade: 1, complementoIds: ['extra-2'] },
      ],
    });
  });
});
