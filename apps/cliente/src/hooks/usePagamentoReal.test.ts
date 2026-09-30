import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { usePagamentoReal } from './usePagamentoReal';
const t = vi.hoisted(() => ({ read: vi.fn(), pix: vi.fn(), card: vi.fn(), complete: vi.fn(), invalidate: vi.fn(), state: 'active', listener: (_status: string) => {} }));
vi.mock('react-native', () => ({ AppState: { get currentState() { return t.state; }, addEventListener: (_name: string, cb: (s: string) => void) => { t.listener = cb; return { remove() {} }; } } }));
vi.mock('@react-navigation/native', () => ({ useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) }));
vi.mock('@keepit/core-data', () => ({ getDataClient: () => ({ payment: { consultar: t.read, iniciarPix: t.pix, pagarCartao: t.card } }) }));
vi.mock('../lib/ordersResource', () => ({ invalidatePedidos: t.invalidate }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
let result: ReturnType<typeof usePagamentoReal>;
function Harness({ pedidoId = 'order' }: { pedidoId?: string }) { result = usePagamentoReal(pedidoId, 'owner', t.complete); return null; }
async function mount() { await act(async () => { renderer = create(React.createElement(Harness)); }); }
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.clearAllMocks(); vi.useRealTimers(); });
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
