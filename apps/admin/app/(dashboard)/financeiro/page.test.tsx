import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../src/hooks/useAdminOps', () => ({ useFinancialDashboard: () => ({
  data: { periodoDias: 30, gmvReais: 107.9, recebidoClientesReais: 107.9,
    receitaKeepitReais: 12.9, despesaGatewayReais: 3.5, dividaLojistasReais: 95,
    repassesPagosReais: 0, reembolsosReais: 0, ranking: [], pedidosTotais: 1,
    pedidosEntregues: 1, pedidosCancelados: 0, pedidosNoShow: 0, taxaSucessoPercent: 100,
    reconciliacoes: [], antecipacoes: [], eventosComErro: [], ocorrenciasPagamento: [{
      id: 'ocorrencia-aberta', pedidoId: 'pedido-10', tipo: 'chargeback', estado: 'pendente',
      referenciaExterna: 'pay-10', detalhe: 'Responsabilidade aguarda decisão administrativa.',
      criadoEm: '2026-09-30T10:00:00.000Z', decisao: null, lancamentos: [],
    }, {
      id: 'ocorrencia-decidida', pedidoId: 'pedido-11', tipo: 'chargeback', estado: 'encerrada',
      referenciaExterna: 'pay-11', detalhe: 'Responsabilidade decidida.', criadoEm: '2026-09-29T10:00:00.000Z',
      decisao: { id: 'decisao-11', ocorrenciaId: 'ocorrencia-decidida', responsavelPrincipal: 'lojista',
        motivo: 'Entrega não comprovada', referencia: 'protocolo-11', principalInformadoCentavos: 10_790,
        principalDebitadoCentavos: 9_500, taxaCentavos: 4_000, lancamentoId: 'ajuste-11',
        criadoEm: '2026-10-01T10:00:00.000Z' },
      lancamentos: [{ id: 'ajuste-11', valorCentavos: -13_500, detalhe: 'Ajuste administrativo de chargeback',
        criadoEm: '2026-10-01T10:00:00.000Z' }],
    }],
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
    }, {
      id: 'evento:evt-sem-pedido', tipo: 'evento_divergente', pedidoId: null,
      operacaoId: 'evt-sem-pedido', abertoEm: '2026-09-30T11:00:00.000Z', ultimoResultado: 'vinculo_nao_encontrado',
      ultimoErro: 'COBRANCA_DESCONHECIDA', referenciaExterna: 'pay-sem-pedido', acaoPermitida: 'consultar_divergencia',
    }] },
  loading: false, error: null, refresh: vi.fn(),
}), resolveChargebackAndRefresh: vi.fn() }));
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
    expect(html).toContain('Escalar sem vínculo');
    expect(html).toContain('href="#escalonamento-sem-vinculo"');
    expect(html).toContain('mantenha o caso aberto até persistir o vínculo ou um resultado sem erro');
    expect(html).toContain('Registre a operação e a referência no controle operacional privado');
    expect(html).toContain('Tratar reembolso');
    expect(html).toContain('Revisar repasse');
    expect(html).not.toContain('Criar cobrança');
    expect(html).not.toContain('Executar repasse');
  });

  it('separa ocorrência aberta, decisão, principal, taxa e lançamento do chargeback', () => {
    const html = renderToStaticMarkup(createElement(FinanceiroPage));

    expect(html).toContain('Decidir responsabilidade');
    expect(html).toContain('Responsabilidade pelo principal');
    expect(html).toContain('Decisão administrativa');
    expect(html).toContain('Entrega não comprovada');
    expect(html).toContain('Principal informado');
    expect(html).toContain('R$ 107,90');
    expect(html).toContain('Principal debitado');
    expect(html).toContain('R$ 95,00');
    expect(html).toContain('Taxa de chargeback');
    expect(html).toContain('R$ 40,00');
    expect(html).toContain('Lançamentos no ledger');
    expect(html).toContain('-R$ 135,00');
  });
});
