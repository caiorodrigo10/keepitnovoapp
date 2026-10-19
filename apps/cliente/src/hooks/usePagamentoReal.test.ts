import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { usePagamentoReal } from './usePagamentoReal';
const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock('../config/featureFlags', () => ({ get CARD_TOKENIZATION_ENABLED() { return flags.enabled; } }));
const t = vi.hoisted(() => ({ read: vi.fn(), pix: vi.fn(), card: vi.fn(), close: vi.fn(), complete: vi.fn(), invalidate: vi.fn(), PaymentError: null as unknown as new (message: string) => Error, state: 'active', listener: (_status: string) => {} }));
vi.mock('react-native', () => ({ AppState: { get currentState() { return t.state; }, addEventListener: (_name: string, cb: (s: string) => void) => { t.listener = cb; return { remove() {} }; } } }));
vi.mock('@react-navigation/native', () => ({ useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) }));
vi.mock('@keepit/core-data', () => ({
  createSupportOperationId: () => 'next-operation',
  PaymentActionError: (() => { class PaymentActionError extends Error { code: string; constructor(code: string) { super(code === 'CARD_TOKENIZATION_DISABLED' ? 'Cartões salvos estão temporariamente indisponíveis. Digite os dados do cartão sem salvar ou use Pix.' : code); this.code = code; } } t.PaymentError = PaymentActionError; return PaymentActionError; })(),
  getDataClient: () => ({ payment: { consultar: t.read, iniciarPix: t.pix, pagarCartao: t.card, encerrarTentativa: t.close } }),
}));
vi.mock('../lib/ordersResource', () => ({ invalidatePedidos: t.invalidate }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
let result: ReturnType<typeof usePagamentoReal>;
function Harness({ pedidoId = 'order' }: { pedidoId?: string }) { result = usePagamentoReal(pedidoId, 'owner', t.complete); return null; }
async function mount() { await act(async () => { renderer = create(React.createElement(Harness)); }); }
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; flags.enabled = true; vi.clearAllMocks(); vi.useRealTimers(); });
it('falha da cobrança continua visível mesmo quando consulta posterior não encontra tentativa', async () => {
  t.read.mockResolvedValue(null); t.pix.mockRejectedValue(new Error('secret transport data'));
  await mount(); await act(async () => { await result.iniciarPix(); });
  expect(result!.error).toMatch(/Não foi possível iniciar/); expect(result!.error).not.toContain('secret');
  expect(t.complete).not.toHaveBeenCalled();
});
it('reabrir e voltar do banco consultam mesmo pedido sem criar outra cobrança', async () => {
  vi.useFakeTimers(); t.read.mockResolvedValue({ id: 'attempt', pedidoId: 'order', estado: 'pendente' });
  await mount(); expect(t.read).toHaveBeenLastCalledWith('order');
  await act(async () => { t.listener('background'); await vi.advanceTimersByTimeAsync(6000); });
  expect(t.read).toHaveBeenCalledOnce();
  await act(async () => { t.listener('active'); });
  expect(t.read).toHaveBeenCalledTimes(2);
  await act(async () => { renderer!.unmount(); }); await mount();
  expect(t.read).toHaveBeenCalledTimes(3); expect(t.pix).not.toHaveBeenCalled(); expect(t.card).not.toHaveBeenCalled(); expect(t.complete).not.toHaveBeenCalled();
});
it('somente confirmação persistida navega uma vez', async () => {
  vi.useFakeTimers(); t.read.mockResolvedValue({ id: 'attempt', pedidoId: 'order', estado: 'confirmado' });
  await mount(); await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(t.complete).toHaveBeenCalledOnce(); expect(t.invalidate).toHaveBeenCalledWith('owner');
});

it('resposta de ação da tela anterior não sobrescreve o pedido atual', async () => {
  let resolve!: (v: unknown) => void;
  t.read.mockResolvedValue(null); t.pix.mockImplementation(() => new Promise((done) => { resolve = done; }));
  await mount();
  await act(async () => { void result.iniciarPix(); });
  await act(async () => { renderer!.update(React.createElement(Harness, { pedidoId: 'other-order' })); });
  t.read.mockImplementation(() => new Promise(() => {}));
  await act(async () => { resolve({ id: 'old', pedidoId: 'order', estado: 'pendente' }); });
  expect(result!.attempt).toBeNull(); expect(result!.submitting).toBe(false);
});
it('a mesma instância confirma outro pedido somente após consultar sua tentativa', async () => {
  t.read.mockImplementation(async (pedidoId) => ({ id: 'attempt-' + pedidoId, pedidoId, estado: 'confirmado' }));
  await mount(); expect(t.complete).toHaveBeenCalledOnce();
  await act(async () => { renderer!.update(React.createElement(Harness, { pedidoId: 'other-order' })); });
  expect(t.complete).toHaveBeenCalledTimes(2);
});

it('recupera QR ausente usando a operação da tentativa retomada, incluindo a segunda tentativa', async () => {
  t.read.mockResolvedValue({ id: 'attempt-second', pedidoId: 'order', operacaoId: 'operation-second', estado: 'pendente' });
  t.pix.mockResolvedValue({ id: 'attempt-second', pedidoId: 'order', operacaoId: 'operation-second', estado: 'pendente' });
  await mount(); await act(async () => { await result.iniciarPix(); });
  expect(t.pix).toHaveBeenCalledWith({ pedidoId: 'order', operacaoId: 'operation-second' });
});

it('encaminha ao pagamento a autorização explícita de salvar o cartão novo', async () => {
  t.read.mockResolvedValue(null);
  t.card.mockResolvedValue({ id: 'attempt', pedidoId: 'order', estado: 'pendente' });
  await mount();
  await act(async () => { await result.pagarCartao({
    type: 'cartao_novo', salvarCartao: false,
    cartao: { holderName: 'Titular', number: '4444444444444', expiryMonth: '12', expiryYear: '2028', ccv: '123' },
    titular: { name: 'Titular', email: 'titular@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '1', phone: '4738010919' },
  }); });
  expect(t.card).toHaveBeenCalledWith({
    pedidoId: 'order', operacaoId: 'order', salvarCartao: false,
    cartao: { holderName: 'Titular', number: '4444444444444', expiryMonth: '12', expiryYear: '2028', ccv: '123' },
    titular: { name: 'Titular', email: 'titular@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '1', phone: '4738010919' },
  });
});

it('cartão salvo envia somente seu ID, sem CVV, biometria ou formulário', async () => {
  t.read.mockResolvedValue(null);
  t.card.mockResolvedValue({ id: 'attempt', pedidoId: 'order', estado: 'pendente' });
  await mount();
  await act(async () => { await result.pagarCartao({ type: 'cartao_salvo', cartaoSalvoId: 'card-salvo' }); });
  expect(t.card).toHaveBeenCalledWith({ pedidoId: 'order', operacaoId: 'order', cartaoSalvoId: 'card-salvo' });
});
it('bloqueia chamada local com cartão salvo antes do port', async () => {
  flags.enabled = false;
  t.read.mockResolvedValue(null);
  await mount();
  await act(async () => { await result.pagarCartao({ type: 'cartao_salvo', cartaoSalvoId: 'card-1' }); });
  expect(t.card).not.toHaveBeenCalled();
  expect(result.actionCode).toBe('CARD_TOKENIZATION_DISABLED');
});

it('encerra uma tentativa pendente apenas por ação explícita, sem recriar o pedido', async () => {
  t.read.mockResolvedValue({ id: 'attempt-open', pedidoId: 'order', estado: 'pendente' });
  t.close.mockResolvedValue({ id: 'attempt-open', pedidoId: 'order', estado: 'expirado' });
  await mount();
  expect(t.close).not.toHaveBeenCalled();
  await act(async () => { await result.encerrarTentativa(); });
  expect(t.close).toHaveBeenCalledWith({ tentativaId: 'attempt-open', operacaoId: 'next-operation' });
  expect(t.card).not.toHaveBeenCalled();
  expect(t.pix).not.toHaveBeenCalled();
});

it('falha de rede não bloqueia permanentemente o formulário de cartão salvo', async () => {
  t.read.mockResolvedValue(null);
  t.card.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValue({ id: 'attempt', pedidoId: 'order', estado: 'pendente' });
  await mount();
  await act(async () => { await result.pagarCartao({ type: 'cartao_salvo', cartaoSalvoId: 'card-1' }); });
  expect(result.error).toMatch(/Não foi possível iniciar/);
  expect(result.submitting).toBe(false);
  await act(async () => { await result.pagarCartao({ type: 'cartao_salvo', cartaoSalvoId: 'card-1' }); });
  expect(t.card).toHaveBeenCalledTimes(2);
});

it('mostra a mensagem local de recusa tipada e libera a próxima tentativa', async () => {
  t.read.mockResolvedValue(null);
  t.card.mockRejectedValue(new t.PaymentError('Cartão recusado. Escolha outro cartão ou pague com Pix.'));
  await mount();
  await act(async () => { await result.pagarCartao({ type: 'cartao_salvo', cartaoSalvoId: 'card-recused' }); });
  expect(result.error).toBe('Cartão recusado. Escolha outro cartão ou pague com Pix.');
  expect(result.submitting).toBe(false);
});
