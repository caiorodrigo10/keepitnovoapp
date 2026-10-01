import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../src/hooks/useAdminOps', () => ({ useFinancialDashboard: () => ({
  data: { periodoDias: 30, gmvReais: 107.9, recebidoClientesReais: 107.9,
    receitaKeepitReais: 12.9, despesaGatewayReais: 3.5, dividaLojistasReais: 95,
    repassesPagosReais: 0, reembolsosReais: 0, ranking: [], pedidosTotais: 1,
    pedidosEntregues: 1, pedidosCancelados: 0, pedidosNoShow: 0, taxaSucessoPercent: 100,
    reconciliacoes: [], antecipacoes: [], eventosComErro: [], ocorrenciasPagamento: [],
    pendenciasFinanceiras: [{
      id: 'tentativa:tentativa-1', tipo: 'reconciliacao_pagamento', pedidoId: 'pedido-1',
      operacaoId: 'operacao-tentativa-1', abertoEm: '2026-09-28T10:00:00.000Z', ultimoResultado: 'aguardando_consulta', ultimoErro: null,
      referenciaExterna: null, acaoPermitida: 'reconciliar_pagamento',
    }, {
      id: 'evento:evt-1', tipo: 'evento_divergente', pedidoId: 'pedido-3',
      operacaoId: 'evt-1', abertoEm: '2026-09-30T10:00:00.000Z', ultimoResultado: 'vinculo_nao_encontrado', ultimoErro: 'COBRANCA_DESCONHECIDA',
      referenciaExterna: 'pay-1', acaoPermitida: 'consultar_divergencia',
    }, {
      id: 'reembolso:refund-1', tipo: 'reembolso', pedidoId: 'pedido-2',
      operacaoId: 'refund-1', abertoEm: '2026-09-29T10:00:00.000Z', ultimoResultado: 'erro', ultimoErro: 'Resposta perdida',
      referenciaExterna: 'refund-ext-1', acaoPermitida: 'tratar_reembolso',
    }, {
      id: 'repasse:repasse-1', tipo: 'repasse_em_analise', pedidoId: null,
      operacaoId: 'op-repasse-1', abertoEm: '2026-09-29T10:00:00.000Z', ultimoResultado: 'análise mantida', ultimoErro: 'PIX incerto',
      referenciaExterna: null, acaoPermitida: 'revisar_repasse',
    }] },
  loading: false, error: null, refresh: vi.fn(),
}) }));
vi.mock('../../../src/lib/adminClient', () => ({ getAdminDataClient: vi.fn() }));

import FinanceiroPage from './page';

describe('dashboard financeiro Admin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('separa cobranças, receita, gateway, dívida, repasses e reembolsos', () => {
    const html = renderToStaticMarkup(createElement(FinanceiroPage));
    expect(html).toContain('Recebido dos clientes');
    expect(html).toContain('Receita bruta Keepit');
    expect(html).toContain('Tarifas de antecipação registradas no gateway');
    expect(html).toContain('Dívida líquida com lojistas');
    expect(html).toContain('Repasses pagos');
    expect(html).toContain('Reembolsos executados');
    expect(html).toContain('R$ 12,90');
  });

  it('mostra a fila completa com idade, correlação, erro, referência e somente ações seguras', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
    const html = renderToStaticMarkup(createElement(FinanceiroPage));

    expect(html).toContain('Pendências financeiras');
    expect(html).toContain('Pedido pedido-1');
    expect(html).toContain('Operação operacao-tentativa-1');
    expect(html).toContain('3 dias úteis');
    expect(html).toContain('Aberta há mais de 1 dia útil');
    expect(html).toContain('COBRANCA_DESCONHECIDA');
    expect(html).toContain('Último resultado: aguardando_consulta');
    expect(html).toContain('Último erro: sem erro registrado');
    expect(html).toContain('pay-1');
    expect(html).toContain('Reconciliar pagamento');
    expect(html).toContain('Inspecionar pedido');
    expect(html).toContain('href="/pedidos/pedido-3"');
    expect(html).toContain('Tratar reembolso');
    expect(html).toContain('Revisar repasse');
    expect(html).not.toContain('Criar cobrança');
    expect(html).not.toContain('Executar repasse');
  });
});
