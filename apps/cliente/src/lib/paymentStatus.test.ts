import { afterEach, expect, it, vi } from 'vitest';
import type { PaymentAttempt } from '@keepit/core-data';
import { isPagamentoConfirmado, startPaymentPolling, paymentMessage, canSubmitCard } from './paymentStatus';
const attempt = (estado: PaymentAttempt['estado']): PaymentAttempt => ({ id: 'a', pedidoId: 'p', estado });
afterEach(() => { vi.useRealTimers(); });
it.each(['criando', 'pendente', 'reconciliacao', 'recusado', 'expirado'] as const)('%s nunca libera confirmação', (estado) => {
  expect(isPagamentoConfirmado(estado)).toBe(false);
});
it.each(['confirmado', 'recebido'] as const)('%s libera confirmação', (estado) => expect(isPagamentoConfirmado(estado)).toBe(true));
it('análise/pendência e reconciliação são explicadas sem sucesso fictício', () => {
  expect(paymentMessage(attempt('pendente'))).toMatch(/Aguardando/);
  expect(paymentMessage(attempt('reconciliacao'))).toMatch(/conciliação/);
});
it('só permite novo cartão sem tentativa ou após recusa/expiração definitivas', () => {
  expect(canSubmitCard(null)).toBe(true);
  for (const estado of ['criando','pendente','reconciliacao','confirmado','recebido'] as const) expect(canSubmitCard(attempt(estado))).toBe(false);
  expect(canSubmitCard(attempt('recusado'))).toBe(true); expect(canSubmitCard(attempt('expirado'))).toBe(true);
});
it('reconciliação bloqueia qualquer nova forma de pagamento até a atualização', () => {
  expect(canSubmitCard(attempt('reconciliacao'))).toBe(false);
  expect(paymentMessage(attempt('reconciliacao'))).toMatch(/Atualizar|conciliação/);
});
it.each(['android','ios'])('polling %s pausa em background, consulta na retomada e cancela ao sair', async () => {
  vi.useFakeTimers(); let listener!: (status: string) => void;
  const remove = vi.fn(); const read = vi.fn(async () => attempt('pendente')); const update = vi.fn();
  const polling = startPaymentPolling({ read, onAttempt: update, onError: vi.fn(), getAppState: () => 'active', subscribe: (cb) => { listener = cb; return { remove }; }, intervalMs: 100 });
  await vi.advanceTimersByTimeAsync(0); expect(update).toHaveBeenLastCalledWith(attempt('pendente'));
  listener('background'); await vi.advanceTimersByTimeAsync(500); expect(read).toHaveBeenCalledTimes(1);
  listener('active'); await vi.advanceTimersByTimeAsync(0); expect(read).toHaveBeenCalledTimes(2);
  polling.stop(); await vi.advanceTimersByTimeAsync(500); expect(read).toHaveBeenCalledTimes(2); expect(remove).toHaveBeenCalledOnce();
});
it('resultado tardio após cancelamento não atualiza UI nem navega', async () => {
  let resolve!: (a: PaymentAttempt) => void; const update = vi.fn();
  const polling = startPaymentPolling({ read: () => new Promise((done) => { resolve = done; }), onAttempt: update, onError: vi.fn(), getAppState: () => 'active', subscribe: () => ({ remove() {} }) });
  polling.stop(); resolve(attempt('confirmado')); await Promise.resolve(); expect(update).not.toHaveBeenCalled();
});
it('erro é sanitizado e refresh só consulta o mesmo pedido, sem sobrepor requests', async () => {
  vi.useFakeTimers(); let reject!: (e: Error) => void; const read = vi.fn(() => new Promise<PaymentAttempt>((_r, fail) => { reject = fail; })); const error = vi.fn();
  const polling = startPaymentPolling({ read, onAttempt: vi.fn(), onError: error, getAppState: () => 'active', subscribe: () => ({ remove() {} }) });
  polling.refresh(); expect(read).toHaveBeenCalledOnce(); reject(new Error('sensitive')); await vi.advanceTimersByTimeAsync(0);
  expect(error).toHaveBeenCalledWith('Não foi possível consultar o pagamento. Tente atualizar.'); polling.stop();
});
