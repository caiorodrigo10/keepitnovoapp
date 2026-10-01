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

  it('salesSummary agrega vendas da loja sem a taxa de serviço Keepit', async () => {
    const resumo7d = await port.salesSummary('estab-farmacia-vida', '7d', { delayMs: 1 });
    expect(resumo7d.periodo).toBe('7d');
    expect(resumo7d.totalVendasReais).toBeGreaterThanOrEqual(0);

    const resumo1a = await port.salesSummary('estab-farmacia-vida', '1a', { delayMs: 1 });
    expect(resumo1a.totalVendasReais).toBeGreaterThan(0);
    expect(resumo1a.totalPedidos).toBeGreaterThan(0);
    // Um período maior nunca soma menos que um período menor.
    expect(resumo1a.totalVendasReais).toBeGreaterThanOrEqual(resumo7d.totalVendasReais);
  });

  it('não atribui cobrança de serviço da plataforma às vendas do lojista', async () => {
    const pedido = db.pedidos[0]!;
    db.pedidos = [{ ...pedido, estabelecimento_id: 'loja-teste', status: 'entregue',
      entregue_em: new Date().toISOString(), subtotal_produtos_reais: 100,
      taxa_deslocamento_reais: 5, taxa_keepit_reais: 10,
      taxa_servico_comprador_reais: 2.9, total_pago_reais: 107.9 }];
    expect((await port.salesSummary('loja-teste', '7d')).totalVendasReais).toBe(105);
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

  it('extrato mock inclui só repasse semanal pago, mantendo histórico legado concluído', async () => {
    db.repasses.push({ id: 'repasse-pago', estabelecimentoId: 'estab-farmacia-vida', semanaInicio: '2026-09-28',
      previstoPara: '2026-10-09', valorCentavos: 500, estado: 'pago', destinatarioNome: 'Loja', destinatarioResponsavel: 'Titular',
      chavePix: 'pix', chavePixTipo: 'email', referencia: 'pix-1', preparadoEm: new Date().toISOString(), confirmadoEm: new Date().toISOString() });
    db.repasses.push({ id: 'repasse-pendente', estabelecimentoId: 'estab-farmacia-vida', semanaInicio: '2026-10-05',
      previstoPara: '2026-10-16', valorCentavos: 300, estado: 'pendente', destinatarioNome: 'Loja', destinatarioResponsavel: 'Titular',
      chavePix: 'pix', chavePixTipo: 'email', referencia: null, preparadoEm: new Date().toISOString(), confirmadoEm: null });
    const list = await port.monthlyStatement('estab-farmacia-vida', { delayMs: 1 });
    expect(list).toContainEqual(expect.objectContaining({ tipo: 'saque', referenciaId: 'repasse-pago', valorReais: 5 }));
    expect(list.some((item) => item.referenciaId === 'repasse-pendente')).toBe(false);
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
