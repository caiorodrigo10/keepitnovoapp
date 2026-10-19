import { beforeEach, describe, expect, it } from 'vitest';

import type { WalletPort } from '../ports/wallet.port';
import { createMockDb, type MockDb } from './db';
import { createWalletMock } from './wallet.mock';

describe('wallet.mock (contract)', () => {
  let db: MockDb;
  let port: WalletPort;

  beforeEach(() => {
    db = createMockDb();
    port = createWalletMock(db);
  });

  it('getBalance resolves with the CarteiraLojista shape', async () => {
    const carteira = await port.getBalance('estab-farmacia-vida', { delayMs: 1 });
    expect(carteira).toMatchObject({
      estabelecimento_id: 'estab-farmacia-vida',
      saldo_disponivel_reais: expect.any(Number),
      saldo_bloqueado_reais: expect.any(Number),
      total_sacado_reais: expect.any(Number),
      total_debitado_reais: expect.any(Number),
    });
  });

  it('the "entregue" pedido-2048 fixture (>7 dias) counts as saldo disponível', async () => {
    const carteira = await port.getBalance('estab-farmacia-vida', { delayMs: 1 });
    expect(carteira.saldo_disponivel_reais).toBeGreaterThan(0);
  });

  it('desconta da carteira o ajuste único de devolução confirmado contra o lojista', async () => {
    const pedido = db.pedidos.find((item) => item.estabelecimento_id === 'estab-farmacia-vida' && item.status === 'entregue')!;
    const antes = await port.getBalance('estab-farmacia-vida', { delayMs: 1 });
    db.ajustesReembolso.push({ reembolsoId: 'refund-1', pedidoId: pedido.id, valorCentavos: -500 });
    const depois = await port.getBalance('estab-farmacia-vida', { delayMs: 1 });
    expect(depois.saldo_disponivel_reais).toBeCloseTo(antes.saldo_disponivel_reais - 5, 2);
    expect(depois.total_debitado_reais).toBe(5);
  });

  it('saque avulso mock também fica desativado, mas histórico permanece legível', async () => {
    await expect(port.requestWithdrawal('estab-farmacia-vida', 250, { delayMs: 1 })).rejects.toThrow('SAQUES_DESATIVADOS_USE_REPASSE_SEMANAL');
    expect(await port.statement('estab-farmacia-vida', { delayMs: 1 })).toEqual(db.saques.filter((item) => item.estabelecimento_id === 'estab-farmacia-vida'));
  });

  it('reserva lote pendente e registra apenas PIX confirmado como sacado', async () => {
    const antes = await port.getBalance('estab-farmacia-vida', { delayMs: 1 });
    const lote = { id: 'lote-test', estabelecimentoId: 'estab-farmacia-vida', semanaInicio: '2026-09-28', previstoPara: '2026-10-09',
      valorCentavos: 500, estado: 'pendente' as const, destinatarioNome: 'Loja', destinatarioResponsavel: 'Titular',
      chavePix: 'pix', chavePixTipo: 'email', referencia: null, preparadoEm: new Date().toISOString(), confirmadoEm: null };
    db.repasses.push(lote);
    const pendente = await port.getBalance('estab-farmacia-vida', { delayMs: 1 });
    expect(pendente.saldo_bloqueado_reais).toBeCloseTo(antes.saldo_bloqueado_reais + 5, 2);
    expect(pendente.saldo_disponivel_reais).toBeCloseTo(antes.saldo_disponivel_reais - 5, 2);
    db.repasses[0]!.estado = 'pago';
    db.repasses[0]!.confirmadoEm = new Date().toISOString();
    const pago = await port.getBalance('estab-farmacia-vida', { delayMs: 1 });
    expect(pago.total_sacado_reais).toBeCloseTo(antes.total_sacado_reais + 5, 2);
    expect(pago.saldo_bloqueado_reais).toBeCloseTo(antes.saldo_bloqueado_reais, 2);
    expect(await port.statement('estab-farmacia-vida', { delayMs: 1 })).toContainEqual(expect.objectContaining({ id: 'lote-test', valor_reais: 5, status: 'concluido' }));
  });

  it('is genuinely asynchronous — does not resolve on the same tick', () => {
    let resolved = false;
    const promise = port.getBalance('estab-farmacia-vida', { delayMs: 0 }).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    return promise;
  });

  it('forceError rejects the Promise', async () => {
    await expect(port.getBalance('estab-farmacia-vida', { forceError: true, delayMs: 1 })).rejects.toThrow();
  });

  it('forceEmpty resolves with a zeroed balance', async () => {
    const carteira = await port.getBalance('estab-farmacia-vida', { forceEmpty: true, delayMs: 1 });
    expect(carteira.saldo_disponivel_reais).toBe(0);
  });
});
