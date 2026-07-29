import { beforeEach, describe, expect, it } from 'vitest';

import type { AnalyticsPort } from '../ports/analytics.port';
import { createAnalyticsMock } from './analytics.mock';
import { createMockDb, type MockDb } from './db';

describe('analytics.mock (contract) — Story 1.10, Task 7', () => {
  let db: MockDb;
  let port: AnalyticsPort;

  beforeEach(() => {
    db = createMockDb();
    port = createAnalyticsMock(db);
  });

  it('salesSummary aggregates total_pago_reais from real pedidos entregues in the period', async () => {
    const resumo7d = await port.salesSummary('estab-farmacia-vida', '7d', { delayMs: 1 });
    expect(resumo7d.periodo).toBe('7d');
    expect(resumo7d.totalVendasReais).toBeGreaterThanOrEqual(0);

    const resumo1a = await port.salesSummary('estab-farmacia-vida', '1a', { delayMs: 1 });
    expect(resumo1a.totalVendasReais).toBeGreaterThan(0);
    expect(resumo1a.totalPedidos).toBeGreaterThan(0);
    // Um período maior nunca soma menos que um período menor.
    expect(resumo1a.totalVendasReais).toBeGreaterThanOrEqual(resumo7d.totalVendasReais);
  });

  it('topProducts aggregates pedidos_itens by nome_snapshot across the period', async () => {
    const produtos = await port.topProducts('estab-farmacia-vida', '1a', { delayMs: 1 });
    expect(produtos.length).toBeGreaterThan(0);
    expect(produtos[0].totalVendidoReais).toBeGreaterThanOrEqual(
      produtos[produtos.length - 1]?.totalVendidoReais ?? 0,
    );
  });

  it('monthlyStatement lists vendas entregues + saques of the current month, most recent first', async () => {
    const movimentacoes = await port.monthlyStatement('estab-farmacia-vida', { delayMs: 1 });
    for (let i = 1; i < movimentacoes.length; i += 1) {
      expect(movimentacoes[i - 1].data >= movimentacoes[i].data).toBe(true);
    }
  });

  it('is genuinely asynchronous — does not resolve on the same tick', () => {
    let resolved = false;
    const promise = port.salesSummary('estab-farmacia-vida', '7d', { delayMs: 0 }).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    return promise;
  });

  it('forceError rejects the Promise', async () => {
    await expect(port.salesSummary('estab-farmacia-vida', '7d', { forceError: true, delayMs: 1 })).rejects.toThrow();
  });

  it('forceEmpty resolves with the empty value', async () => {
    const resumo = await port.salesSummary('estab-farmacia-vida', '7d', { forceEmpty: true, delayMs: 1 });
    expect(resumo.totalVendasReais).toBe(0);
    expect(resumo.totalPedidos).toBe(0);

    await expect(port.topProducts('estab-farmacia-vida', '7d', { forceEmpty: true, delayMs: 1 })).resolves.toEqual([]);
    await expect(port.monthlyStatement('estab-farmacia-vida', { forceEmpty: true, delayMs: 1 })).resolves.toEqual([]);
  });
});
