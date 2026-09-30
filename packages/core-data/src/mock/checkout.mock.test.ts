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
  it('não retorna pedido fictício na nova port', async () => {
    await expect(setup().checkout.criar({ cotacaoId: 'q', forma: 'pix', nfSolicitada: false, operacaoId: 'op' })).rejects.toThrow('CHECKOUT_INDISPONIVEL');
  });
});
