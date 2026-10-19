import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import ModalPagamentoPix from './ModalPagamentoPix';
import ModalProcessandoPagamento from './ModalProcessandoPagamento';
const state = vi.hoisted(() => ({ real: true, email: 'cliente@example.invalid', cards: [{ id: 'card-1', bandeira: 'visa', ultimo4: '4242', principal: true }], actionCode: null as string | null, error: null as string | null, attempt: { id: 'a', pedidoId: 'p', estado: 'pendente', pix: { imagemBase64: 'REAL-IMAGE', copiaCola: 'REAL-PIX', expiraEm: new Date(Date.now() + 60_000).toISOString() } } as any, simulated: vi.fn(() => ({ status: 'aguardando', retry() {} })), copy: vi.fn(), refresh: vi.fn(), refreshCards: vi.fn(), start: vi.fn(), pay: vi.fn() }));
const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../config/featureFlags', () => ({ get CARD_TOKENIZATION_ENABLED() { return flags.enabled; } }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@keepit/ui-tokens', async () => { const { default: t } = await import('../../../../../packages/ui-tokens/src/tokens.json'); return { lightColors: t.colors.light, radii: t.radii, spacing: t.spacing, typography: t.typography }; });
vi.mock('expo-clipboard', () => ({ setStringAsync: state.copy }));
vi.mock('react-native-qrcode-svg', () => ({ default: 'QRCode' }));
vi.mock('../../components/ui', () => ({ AppHeader: 'Header', Screen: 'Screen', FormScreen: 'FormScreen', Button: 'Button' }));
vi.mock('../../components/discovery', () => ({ AsyncStateBlock: 'AsyncStateBlock' }));
vi.mock('../../hooks/useCurrentCliente', () => ({ useCurrentCliente: () => ({ data: { id: 'u' } }) }));
vi.mock('../../hooks/useCurrentEmail', () => ({ useCurrentEmail: () => ({ data: state.email }) }));
vi.mock('../../hooks/useSavedCards', () => ({ useSavedCards: () => ({ cards: state.cards, loading: false, refresh: state.refreshCards }) }));
vi.mock('../../hooks/usePedidoDetail', () => ({ usePedidoDetail: () => ({ data: { id: 'p', cliente_id: 'u', status: 'aguardando_pagamento', total_pago_reais: 42.5 }, loading: false, error: null }) }));
vi.mock('../../hooks/usePagamentoSimulado', () => ({ usePagamentoSimulado: state.simulated }));
vi.mock('../../hooks/usePagamentoReal', () => ({ usePagamentoReal: () => ({ attempt: state.attempt, actionCode: state.actionCode, loaded: true, error: state.error, submitting: false, refresh: state.refresh, iniciarPix: state.start, pagarCartao: state.pay }) }));
vi.mock('../../lib/dataSource', () => ({ isSupabaseDataSource: () => state.real, isMockDataSource: () => !state.real }));
vi.mock('../../components/checkout/CardPaymentForm', () => ({ CardPaymentForm: 'CardPaymentForm' }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; flags.enabled = true; vi.clearAllMocks(); });
const props = { route: { params: { pedidoId: 'p' } }, navigation: { replace: vi.fn(), navigate: vi.fn() } } as any;
it('Supabase PIX mostra artefatos e vencimento reais sem invocar simulação', async () => {
  state.attempt = { ...state.attempt, pix: { ...state.attempt.pix, expiraEm: new Date(Date.now() + 86_400_000).toISOString() } };
  await act(async () => { renderer = create(React.createElement(ModalPagamentoPix, props)); });
  expect(state.simulated).not.toHaveBeenCalled();
  expect(renderer!.root.findByType('Image' as never).props.source).toEqual({ uri: 'data:image/png;base64,REAL-IMAGE' });
  expect(JSON.stringify(renderer!.toJSON())).toContain('REAL-PIX');
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('FAKE-KEEPIT');
  expect(JSON.stringify(renderer!.toJSON())).toContain('Expira');
});
it.each(['criando','pendente','reconciliacao'])('Supabase cartão %s não mostra sucesso nem inicia simulação', async (estado) => {
  state.attempt = { id: 'a', pedidoId: 'p', estado };
  await act(async () => { renderer = create(React.createElement(ModalProcessandoPagamento, props)); });
  expect(state.simulated).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer!.toJSON())).not.toMatch(/Pagamento (aprovado|confirmado)/);
  expect(renderer!.root.findAllByType('CardPaymentForm' as never)).toHaveLength(0);
});
it('Supabase cartão pré-preenche o e-mail disponível no formulário transitório', async () => {
  state.attempt = null;
  await act(async () => { renderer = create(React.createElement(ModalProcessandoPagamento, props)); });
  expect(renderer!.root.findByType('CardPaymentForm' as never).props.initialHolder).toEqual({ name: undefined, cpfCnpj: undefined, phone: undefined, email: 'cliente@example.invalid' });
});
it('cartão salvo só chama a cobrança após o toque final e manda apenas o ID', async () => {
  state.attempt = null;
  const savedProps = { ...props, route: { params: { pedidoId: 'p', cartaoSalvoId: 'card-1' } } };
  await act(async () => { renderer = create(React.createElement(ModalProcessandoPagamento, savedProps)); });
  expect(state.pay).not.toHaveBeenCalled();
  const payButton = renderer!.root.findAllByType('Button' as never).find((node) => node.props.title === 'Pagar')!;
  await act(async () => { payButton.props.onPress(); });
  expect(state.pay).toHaveBeenCalledWith({ type: 'cartao_salvo', cartaoSalvoId: 'card-1' });
  expect(JSON.stringify(renderer!.toJSON())).toContain('4242');
});
it('avisa que o pagamento segue válido quando o salvamento do cartão fica incompleto', async () => {
  state.attempt = { id: 'a', pedidoId: 'p', estado: 'pendente', avisoCartao: 'nao_salvo' };
  await act(async () => { renderer = create(React.createElement(ModalProcessandoPagamento, props)); });
  expect(JSON.stringify(renderer!.toJSON())).toMatch(/não foi salvo/i);
});
it('token inválido atualiza a lista pública sem remover outros cartões por conta própria', async () => {
  state.actionCode = 'CARTAO_TOKEN_INVALIDO';
  state.attempt = null;
  await act(async () => { renderer = create(React.createElement(ModalProcessandoPagamento, props)); });
  expect(state.refreshCards).toHaveBeenCalledOnce();
});
it('cartão salvo ausente da sessão não fica disponível para cobrança final', async () => {
  state.actionCode = null;
  state.cards = [];
  state.attempt = null;
  const removedProps = { ...props, route: { params: { pedidoId: 'p', cartaoSalvoId: 'card-removido' } } };
  await act(async () => { renderer = create(React.createElement(ModalProcessandoPagamento, removedProps)); });
  expect(renderer!.root.findAllByType('Button' as never).some((node) => node.props.title === 'Pagar')).toBe(false);
  expect(JSON.stringify(renderer!.toJSON())).toMatch(/não está mais disponível/i);
});

it('recusa terminal mantém o pedido e oferece outro cartão ou PIX', async () => {
  state.cards = [
    { id: 'card-1', bandeira: 'visa', ultimo4: '4242', principal: true },
    { id: 'card-2', bandeira: 'mastercard', ultimo4: '9999', principal: false },
  ];
  state.error = 'Cartão recusado. Escolha outro cartão ou pague com Pix.';
  state.attempt = { id: 'declined', pedidoId: 'p', estado: 'recusado' };
  const savedProps = { ...props, route: { params: { pedidoId: 'p', cartaoSalvoId: 'card-1' } } };
  await act(async () => { renderer = create(React.createElement(ModalProcessandoPagamento, savedProps)); });
  expect(JSON.stringify(renderer!.toJSON())).toContain('9999');
  expect(renderer!.root.findAllByType('Button' as never).some((node) => node.props.title === 'Pagar com PIX')).toBe(true);
  expect(renderer!.root.findAllByType('Button' as never).some((node) => node.props.title === 'Pagar')).toBe(true);
});
