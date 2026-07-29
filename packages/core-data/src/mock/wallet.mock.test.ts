import { businessConfig } from '@keepit/config';
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

  it('requestWithdrawal rejects below businessConfig.saqueMinimoReais', async () => {
    await expect(
      port.requestWithdrawal('estab-farmacia-vida', businessConfig.saqueMinimoReais - 1, { delayMs: 1 }),
    ).rejects.toThrow(/mínimo/i);
  });

  it('requestWithdrawal rejects when the amount exceeds saldo disponível', async () => {
    await expect(
      port.requestWithdrawal('estab-farmacia-vida', 999999, { delayMs: 1 }),
    ).rejects.toThrow(/insuficiente/i);
  });

  it('statement lists saques created via requestWithdrawal', async () => {
    const carteira = await port.getBalance('estab-farmacia-vida', { delayMs: 1 });
    if (carteira.saldo_disponivel_reais >= businessConfig.saqueMinimoReais) {
      await port.requestWithdrawal('estab-farmacia-vida', businessConfig.saqueMinimoReais, { delayMs: 1 });
      const statement = await port.statement('estab-farmacia-vida', { delayMs: 1 });
      expect(statement.length).toBeGreaterThan(0);
    }
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
