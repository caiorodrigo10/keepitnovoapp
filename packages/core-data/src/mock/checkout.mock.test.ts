import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from './db';
import { createSettingsMock } from './settings.mock';
import { createCheckoutMock } from './checkout.mock';
function setup() {
  const db = createMockDb();
  db.sessionClienteId = db.clientes[0].id;
  const loja = db.estabelecimentos[0]; const produto = db.produtos.find((p) => p.estabelecimento_id === loja.id)!;
  produto.preco_reais = 100; produto.ativo = true;
  loja.taxa_deslocamento_reais = 5; loja.ticket_minimo_reais = 20; loja.pausado_manualmente = false;
  const settings = createSettingsMock();
  return { db, loja, produto, settings, checkout: createCheckoutMock(db, settings), input: { estabelecimentoId: loja.id, hubId: db.hubs[0].id, itens: [{ produtoId: produto.id, quantidade: 1 }] } };
}
describe('cotação demo', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T15:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });
  it('usa catálogo e taxas atuais, com snapshots independentes', async () => {
    const { checkout, settings, input } = setup();
    const primeira = await checkout.cotar(input);
    expect(primeira).toMatchObject({ subtotalCentavos: 10000, freteCentavos: 500, totalCentavos: 10790, comissaoCentavos: 1000, liquidoLojistaCentavos: 9500 });
    await settings.updateTaxas({ comissaoBps: 2000, servicoCentavos: 390, versaoEsperada: primeira.taxas.versao, motivo: 'Ajuste', operacaoId: 'op' });
    expect(await checkout.cotar(input)).toMatchObject({ totalCentavos: 10890, comissaoCentavos: 2000, liquidoLojistaCentavos: 8500 });
    expect(primeira.taxas.servicoCentavos).toBe(290);
  });
  it('arredonda comissão uma única vez sobre subtotal', async () => {
    const { checkout, input, produto, loja } = setup(); produto.preco_reais = 0.05; loja.ticket_minimo_reais = 0;
    expect(await checkout.cotar({ ...input, itens: [{ produtoId: produto.id, quantidade: 3 }] })).toMatchObject({ subtotalCentavos: 15, comissaoCentavos: 2 });
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])('recusa quantidade inválida %s', async (quantidade) => {
    const { checkout, input } = setup();
    await expect(checkout.cotar({ ...input, itens: [{ ...input.itens[0], quantidade }] })).rejects.toThrow('ITENS_INVALIDOS');
  });
  it.each(['auth','pausada','outra loja','produto','mínimo','horário','hub'] as const)('recusa %s', async (caseName) => {
    const { checkout, input, db, loja, produto } = setup();
    const errors = { auth: 'ACESSO_NEGADO', pausada: 'LOJA_INDISPONIVEL', 'outra loja': 'PRODUTO_INDISPONIVEL', produto: 'PRODUTO_INDISPONIVEL', mínimo: 'MINIMO_NAO_ATINGIDO', horário: 'HORARIO_INVIAVEL', hub: 'HUB_INDISPONIVEL' };
    if (caseName === 'auth') db.sessionClienteId = null;
    if (caseName === 'pausada') loja.pausado_manualmente = true;
    if (caseName === 'outra loja') produto.estabelecimento_id = 'outra';
    if (caseName === 'produto') produto.ativo = false;
    if (caseName === 'mínimo') loja.ticket_minimo_reais = 101;
    if (caseName === 'horário') db.hubs[0].horarios = [];
    if (caseName === 'hub') db.hubs[0].ativo = false;
    await expect(checkout.cotar(input)).rejects.toThrow(errors[caseName]);
  });
  it('fecha a loja no instante exato do encerramento', async () => {
    const { checkout, input, loja } = setup();
    loja.horarios.find((h) => h.dia_semana === 3)!.hora_fecha = '12:00';
    await expect(checkout.cotar(input)).rejects.toThrow('HORARIO_INVIAVEL');
  });
  it('cria pedido pendente idempotente da cotação e nega PIN', async () => {
    vi.useRealTimers();
    const { checkout, input, db } = setup();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T15:00:00Z'));
    const cotacao = await checkout.cotar(input);
    const criar = { cotacaoId: cotacao.id, forma: 'pix' as const, nfSolicitada: false, operacaoId: 'op' };
    const promessa = checkout.criar(criar); await vi.runAllTimersAsync(); const result = await promessa;
    expect(await checkout.criar(criar)).toEqual(result);
    const pedido = db.pedidos.find((p) => p.id === result.pedidoId)!;
    expect(pedido.status).toBe('aguardando_pagamento');
    expect(pedido.total_pago_reais).toBe(107.9);
  });
  it('persiste no pedido o snapshot completo dos complementos da cotação', async () => {
    vi.useRealTimers();
    const { checkout, input, db, produto } = setup();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T15:00:00Z'));
    produto.gruposComplementos = [
      { id: 'tamanho', nome: 'Tamanho', tipo: 'unica', min_selecoes: 1, max_selecoes: 1, ordem: 0, itens: [{ id: 'grande', nome: 'Grande', preco_extra_reais: 4, ordem: 0 }] },
      { id: 'adicionais', nome: 'Adicionais', tipo: 'multipla', min_selecoes: 0, max_selecoes: 2, ordem: 1, itens: [{ id: 'bacon', nome: 'Bacon', preco_extra_reais: 5, ordem: 0 }] },
    ];
    const cotacao = await checkout.cotar({ ...input, itens: [{ produtoId: produto.id, quantidade: 1, complementoIds: ['grande', 'bacon'] }] });
    const creating = checkout.criar({ cotacaoId: cotacao.id, forma: 'pix', nfSolicitada: false, operacaoId: 'complementos' });
    await vi.runAllTimersAsync();
    const { pedidoId } = await creating;

    expect(db.pedidos.find((pedido) => pedido.id === pedidoId)?.itens[0]?.complementos_snapshot).toEqual([
      { grupoId: 'tamanho', grupoNome: 'Tamanho', itemId: 'grande', itemNome: 'Grande', precoExtraCentavos: 400 },
      { grupoId: 'adicionais', grupoNome: 'Adicionais', itemId: 'bacon', itemNome: 'Bacon', precoExtraCentavos: 500 },
    ]);
  });
  it('revalida preço antes da criação e não deixa pedido parcial', async () => {
    const { checkout, input, produto, db } = setup();
    const q = await checkout.cotar(input); const count = db.pedidos.length; produto.preco_reais = 101;
    await expect(checkout.criar({ cotacaoId: q.id, forma: 'pix', nfSolicitada: false, operacaoId: 'op' })).rejects.toThrow('COTACAO_DESATUALIZADA');
    expect(db.pedidos).toHaveLength(count);
  });
});

it('duas operações concorrentes não consomem a mesma cotação demo', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T15:00:00Z'));
  try {
    const { checkout, input, db } = setup(); const q = await checkout.cotar(input); const count = db.pedidos.length;
    const a = checkout.criar({ cotacaoId: q.id, forma: 'pix', nfSolicitada: false, operacaoId: 'primeira' });
    const b = checkout.criar({ cotacaoId: q.id, forma: 'pix', nfSolicitada: false, operacaoId: 'segunda' });
    const joined = Promise.allSettled([a, b]); await vi.runAllTimersAsync();
    expect((await joined).filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(db.pedidos.length - count).toBe(1);
  } finally { vi.useRealTimers(); }
});
