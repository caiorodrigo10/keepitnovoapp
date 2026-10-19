import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';

import Pagamento from './Pagamento';

type PendingTarget = { pedidoId: string; paymentType: 'cartao' | 'pix'; cartaoSalvoId?: string } | null;

const flags = vi.hoisted(() => ({ enabled: true }));
const state = vi.hoisted(() => ({
  cards: [{ id: 'card-1', bandeira: 'Visa', ultimo4: '4242', principal: true }],
  cart: {
    estabelecimentoId: 'loja-1', hubId: 'hub-1', items: [{ produtoId: 'produto-1', quantidade: 1 }],
    payment: null as { type: 'pix' } | { type: 'cartao_novo' } | { type: 'cartao_salvo'; cartaoSalvoId: string } | null,
    nfSolicitada: false, clearOrder: vi.fn(async () => ({ status: 'committed' })), clearPayment: vi.fn(async () => ({ status: 'committed' })), setPayment: vi.fn(async () => ({ status: 'committed' })),
  },
  controller: {
    getPendingTarget: vi.fn<[], PendingTarget>(() => null),
    submit: vi.fn<[unknown], Promise<{ status: 'ready'; target: Exclude<PendingTarget, null> }>>(async () => ({ status: 'ready', target: { pedidoId: 'pedido-1', paymentType: 'cartao' } })),
  },
  rootNavigate: vi.fn(),
}));

vi.mock('../../config/featureFlags', () => ({ get CARD_TOKENIZATION_ENABLED() { return flags.enabled; } }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', StyleSheet: { create: (value: unknown) => value }, Text: 'Text', View: 'View' }));
vi.mock('@keepit/ui-tokens', async () => {
  const { default: tokens } = await import('../../../../../packages/ui-tokens/src/tokens.json');
  return { lightColors: tokens.colors.light, spacing: tokens.spacing, typography: tokens.typography };
});
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: state.rootNavigate }) }));
vi.mock('@keepit/core-data', () => ({ getDataClient: () => ({ store: { getById: vi.fn() } }) }));
vi.mock('../../components/checkout', () => ({ SelectableRow: 'SelectableRow' }));
vi.mock('../../components/ui', () => ({ AppHeader: 'AppHeader', Button: 'Button', Screen: 'Screen' }));
vi.mock('../../context/CartContext', () => ({ useCart: () => state.cart }));
vi.mock('../../hooks/useCotacao', () => ({ useCotacao: () => ({ data: { id: 'cotacao-1' }, loading: false, error: null, refresh: vi.fn() }) }));
vi.mock('../../hooks/useCurrentCliente', () => ({ useCurrentCliente: () => ({ data: { id: 'cliente-1' } }) }));
vi.mock('../../hooks/useSavedCards', () => ({ useSavedCards: () => ({ cards: state.cards, loading: false }) }));
vi.mock('../../hooks/useStoreDetail', () => ({ useStoreDetail: () => ({ data: { id: 'loja-1' }, loading: false }) }));
vi.mock('../../lib/checkoutTotals', () => ({ checkoutTotalsFromQuote: () => ({ totalReais: 42, taxaServicoReais: 0 }) }));
vi.mock('../../lib/checkoutValidation', () => ({
  canCheckoutStore: () => true, getCheckoutStoreBlockMessage: () => null, loadCheckoutStoreForSubmission: vi.fn(),
}));
vi.mock('../../lib/dataSource', () => ({ isSupabaseDataSource: () => true }));
vi.mock('../../lib/ordersResource', () => ({ invalidatePedidos: vi.fn() }));
vi.mock('../../lib/paymentSubmission', () => ({ createPaymentSubmissionController: () => state.controller }));
vi.mock('../../lib/createOrderFromQuote', () => ({ createOrderFromQuote: vi.fn() }));
vi.mock('../../lib/format', () => ({ formatReais: (value: number) => `R$ ${value}` }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | undefined;
const navigation = { navigate: vi.fn() };

function rows() {
  return renderer!.root.findAllByType('SelectableRow' as never);
}

function resetState() {
  flags.enabled = true;
  state.cards = [{ id: 'card-1', bandeira: 'Visa', ultimo4: '4242', principal: true }];
  state.cart.payment = null;
  state.controller.getPendingTarget.mockReturnValue(null);
  state.controller.submit.mockResolvedValue({ status: 'ready', target: { pedidoId: 'pedido-1', paymentType: 'cartao' } });
}

afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  resetState();
});

it('com a flag desligada remove cartões salvos, limpa a seleção antiga e mantém PIX e cartão digitado selecionáveis', async () => {
  flags.enabled = false;
  state.cart.payment = { type: 'cartao_salvo', cartaoSalvoId: 'card-1' };

  await act(async () => { renderer = create(React.createElement(Pagamento, { navigation: navigation as never, route: {} as never })); });

  expect(state.cart.clearPayment).toHaveBeenCalled();
  expect(rows().map((row) => row.props.title)).toEqual(['PIX', 'Novo cartão de crédito à vista']);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('4242');
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('Principal');
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('Salvar este cartão');
  await act(async () => { rows().find((row) => row.props.title === 'PIX')!.props.onPress(); });
  await act(async () => { rows().find((row) => row.props.title === 'Novo cartão de crédito à vista')!.props.onPress(); });
  expect(state.cart.setPayment).toHaveBeenNthCalledWith(1, { type: 'pix' });
  expect(state.cart.setPayment).toHaveBeenNthCalledWith(2, { type: 'cartao_novo' });

  const continueButton = renderer!.root.findAllByType('Button' as never).find((button) => button.props.title.includes('Continuar'))!;
  await act(async () => { await continueButton.props.onPress(); });
  expect(state.controller.submit).not.toHaveBeenCalled();
});

it('com a flag desligada retoma um pedido pendente sem propagar o ID do cartão salvo', async () => {
  flags.enabled = false;
  state.controller.getPendingTarget.mockReturnValue({ pedidoId: 'pedido-pendente', paymentType: 'cartao', cartaoSalvoId: 'card-1' });
  state.controller.submit.mockResolvedValue({ status: 'ready', target: { pedidoId: 'pedido-pendente', paymentType: 'cartao', cartaoSalvoId: 'card-1' } });

  await act(async () => { renderer = create(React.createElement(Pagamento, { navigation: navigation as never, route: {} as never })); });
  const continueButton = renderer!.root.findAllByType('Button' as never).find((button) => button.props.title.includes('Continuar'))!;
  await act(async () => { await continueButton.props.onPress(); });

  expect(state.controller.submit).toHaveBeenCalledWith(expect.objectContaining({ paymentType: 'cartao', cartaoSalvoId: undefined }));
  expect(state.rootNavigate).toHaveBeenCalledWith('ModalProcessandoPagamento', { pedidoId: 'pedido-pendente' });
});

it('com a flag ligada conserva a opção de cartão salvo e sua seleção', async () => {
  flags.enabled = true;

  await act(async () => { renderer = create(React.createElement(Pagamento, { navigation: navigation as never, route: {} as never })); });

  const savedCard = rows().find((row) => row.props.title === 'Cartão •••• 4242')!;
  expect(savedCard).toBeDefined();
  await act(async () => { savedCard.props.onPress(); });
  expect(state.cart.setPayment).toHaveBeenCalledWith({ type: 'cartao_salvo', cartaoSalvoId: 'card-1' });
});
