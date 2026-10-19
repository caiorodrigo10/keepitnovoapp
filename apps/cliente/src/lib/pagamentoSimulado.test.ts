import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Pedido } from '@keepit/core-data';

import {
  CARTAO_AUTO_CONFIRM_DELAY_MS,
  CONFIRMADO_PAUSE_MS,
  PIX_AUTO_CONFIRM_DELAY_MS,
  pixCopiaCola,
  startPagamentoSimulado,
} from './pagamentoSimulado';

function pedidoComId(id: string, totalPagoReais = 37.7): Pedido {
  return { id, total_pago_reais: totalPagoReais } as Pedido;
}

describe('pixCopiaCola (Story 6.7.1, AC1)', () => {
  it('é determinístico — o mesmo pedido gera sempre o mesmo código', () => {
    const pedido = pedidoComId('pedido-abc123');
    expect(pixCopiaCola(pedido)).toBe(pixCopiaCola(pedido));
  });

  it('difere entre pedidos diferentes', () => {
    expect(pixCopiaCola(pedidoComId('pedido-1'))).not.toBe(pixCopiaCola(pedidoComId('pedido-2')));
  });

  it('é explicitamente marcado como FAKE — nunca um payload PIX real', () => {
    const codigo = pixCopiaCola(pedidoComId('pedido-1'));
    expect(codigo).toContain('FAKE');
    expect(codigo).toContain('NAO-E-PIX-REAL');
  });

  it('embute o total pago (sem ponto decimal) no código', () => {
    const codigo = pixCopiaCola(pedidoComId('pedido-1', 37.7));
    expect(codigo).toContain('3770');
  });
});

describe('startPagamentoSimulado (Story 6.7.1, AC1, AC2, AC3, AC8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('após delayMs, chama confirmarPagamento e emite "confirmado"; após pauseMs, chama onComplete (AC1, AC2, AC3)', async () => {
    const confirmarPagamento = vi.fn().mockResolvedValue(undefined);
    const onStatusChange = vi.fn();
    const onComplete = vi.fn();

    startPagamentoSimulado({
      setTimeout,
      clearTimeout,
      confirmarPagamento,
      delayMs: PIX_AUTO_CONFIRM_DELAY_MS,
      pauseMs: CONFIRMADO_PAUSE_MS,
      onStatusChange,
      onComplete,
    });

    expect(confirmarPagamento).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PIX_AUTO_CONFIRM_DELAY_MS);
    expect(confirmarPagamento).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('confirmado');
    expect(onComplete).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(CONFIRMADO_PAUSE_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('usa CARTAO_AUTO_CONFIRM_DELAY_MS quando informado (AC3)', async () => {
    const confirmarPagamento = vi.fn().mockResolvedValue(undefined);
    const onStatusChange = vi.fn();

    startPagamentoSimulado({
      setTimeout,
      clearTimeout,
      confirmarPagamento,
      delayMs: CARTAO_AUTO_CONFIRM_DELAY_MS,
      pauseMs: CONFIRMADO_PAUSE_MS,
      onStatusChange,
      onComplete: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(CARTAO_AUTO_CONFIRM_DELAY_MS - 1);
    expect(confirmarPagamento).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(confirmarPagamento).toHaveBeenCalledTimes(1);
  });

  it('confirmarPagamento rejeitando emite "erro" — nunca chama onComplete (AC8, sem navegação sem confirmação)', async () => {
    const confirmarPagamento = vi.fn().mockRejectedValue(new Error('falha simulada'));
    const onStatusChange = vi.fn();
    const onComplete = vi.fn();

    startPagamentoSimulado({
      setTimeout,
      clearTimeout,
      confirmarPagamento,
      delayMs: PIX_AUTO_CONFIRM_DELAY_MS,
      pauseMs: CONFIRMADO_PAUSE_MS,
      onStatusChange,
      onComplete,
    });

    await vi.advanceTimersByTimeAsync(PIX_AUTO_CONFIRM_DELAY_MS);
    expect(onStatusChange).toHaveBeenCalledWith('erro');

    await vi.advanceTimersByTimeAsync(CONFIRMADO_PAUSE_MS);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('retry() volta para "aguardando" e reagenda uma NOVA tentativa (AC8 — "Tentar novamente")', async () => {
    const confirmarPagamento = vi.fn().mockRejectedValueOnce(new Error('falha simulada')).mockResolvedValueOnce(undefined);
    const onStatusChange = vi.fn();
    const onComplete = vi.fn();

    const controller = startPagamentoSimulado({
      setTimeout,
      clearTimeout,
      confirmarPagamento,
      delayMs: PIX_AUTO_CONFIRM_DELAY_MS,
      pauseMs: CONFIRMADO_PAUSE_MS,
      onStatusChange,
      onComplete,
    });

    await vi.advanceTimersByTimeAsync(PIX_AUTO_CONFIRM_DELAY_MS);
    expect(onStatusChange).toHaveBeenCalledWith('erro');

    onStatusChange.mockClear();
    controller.retry();
    expect(onStatusChange).toHaveBeenCalledWith('aguardando');

    await vi.advanceTimersByTimeAsync(PIX_AUTO_CONFIRM_DELAY_MS);
    expect(confirmarPagamento).toHaveBeenCalledTimes(2);
    expect(onStatusChange).toHaveBeenCalledWith('confirmado');

    await vi.advanceTimersByTimeAsync(CONFIRMADO_PAUSE_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('stop() antes do delay cancela a confirmação — nenhuma chamada "fantasma" (AC2/AC3: sair da tela cancela o timer)', async () => {
    const confirmarPagamento = vi.fn().mockResolvedValue(undefined);
    const onStatusChange = vi.fn();

    const controller = startPagamentoSimulado({
      setTimeout,
      clearTimeout,
      confirmarPagamento,
      delayMs: PIX_AUTO_CONFIRM_DELAY_MS,
      pauseMs: CONFIRMADO_PAUSE_MS,
      onStatusChange,
      onComplete: vi.fn(),
    });

    controller.stop();

    await vi.advanceTimersByTimeAsync(PIX_AUTO_CONFIRM_DELAY_MS + CONFIRMADO_PAUSE_MS);
    expect(confirmarPagamento).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('stop() depois de confirmado, mas ANTES do pauseMs, cancela onComplete (unmount durante a pausa)', async () => {
    const confirmarPagamento = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();

    const controller = startPagamentoSimulado({
      setTimeout,
      clearTimeout,
      confirmarPagamento,
      delayMs: PIX_AUTO_CONFIRM_DELAY_MS,
      pauseMs: CONFIRMADO_PAUSE_MS,
      onStatusChange: vi.fn(),
      onComplete,
    });

    await vi.advanceTimersByTimeAsync(PIX_AUTO_CONFIRM_DELAY_MS);
    controller.stop();

    await vi.advanceTimersByTimeAsync(CONFIRMADO_PAUSE_MS);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('retry() depois de stop() é um no-op — nunca reagenda um timer pós-unmount', async () => {
    const confirmarPagamento = vi.fn().mockResolvedValue(undefined);
    const onStatusChange = vi.fn();

    const controller = startPagamentoSimulado({
      setTimeout,
      clearTimeout,
      confirmarPagamento,
      delayMs: PIX_AUTO_CONFIRM_DELAY_MS,
      pauseMs: CONFIRMADO_PAUSE_MS,
      onStatusChange,
      onComplete: vi.fn(),
    });

    controller.stop();
    onStatusChange.mockClear();
    controller.retry();

    expect(onStatusChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PIX_AUTO_CONFIRM_DELAY_MS);
    expect(confirmarPagamento).not.toHaveBeenCalled();
  });
});
