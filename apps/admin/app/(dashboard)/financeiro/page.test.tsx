import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hookState = vi.hoisted(() => ({
  refresh: vi.fn(),
  reconcilePaymentAndRefresh: vi.fn(),
  resolveChargebackAndRefresh: vi.fn(),
  loading: false,
  error: null as Error | null,
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: 'a' }));
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
  loading: hookState.loading, error: hookState.error, refresh: hookState.refresh, refreshAndWait: hookState.refresh,
}),
  reconcilePaymentAndRefresh: hookState.reconcilePaymentAndRefresh,
  resolveChargebackAndRefresh: hookState.resolveChargebackAndRefresh,
}));
vi.mock('../../../src/lib/adminClient', () => ({ getAdminDataClient: vi.fn() }));

import FinanceiroPage, { createChargebackDraftOperationTracker } from './page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | undefined;

describe('dashboard financeiro Admin', () => {
  afterEach(async () => {
    if (renderer) await act(async () => renderer?.unmount());
    renderer = undefined;
    hookState.loading = false;
    hookState.error = null;
    vi.useRealTimers();
    vi.clearAllMocks();
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

  it('oculta os dados de 30 dias quando a busca de 7 dias falha e mantém o retry claro', async () => {
    await act(async () => { renderer = create(createElement(FinanceiroPage)); });
    const page = renderer!;
    const sevenDaysButton = page.root.findAllByType('button')
      .find((button) => button.children.join('') === '7 dias');

    hookState.error = new Error('falha ao carregar 7 dias');
    await act(async () => { sevenDaysButton?.props.onClick(); });

    const output = JSON.stringify(page.toJSON());
    expect(output).toContain('Erro ao carregar dashboard: ');
    expect(output).toContain('falha ao carregar 7 dias');
    expect(output).toContain('Tentar novamente');
    expect(output).not.toContain('Recebido dos clientes no período');
    expect(output).not.toContain('R$ 107,90');
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

  it('reusa a operação no retry do mesmo rascunho e troca ao editar os dados', () => {
    const ids = ['operacao-1', 'operacao-2', 'operacao-3'];
    const tracker = createChargebackDraftOperationTracker(() => ids.shift()!);
    const draft = {
      responsavelPrincipal: 'lojista' as const,
      principalCentavos: 10_790,
      motivo: 'Entrega não comprovada',
      referencia: 'protocolo-123',
    };

    expect(tracker.operationIdFor(draft)).toBe('operacao-1');
    expect(tracker.operationIdFor({ ...draft })).toBe('operacao-1');
    expect(tracker.operationIdFor({ ...draft, referencia: 'protocolo-124' })).toBe('operacao-2');
    tracker.resetAfterPersistence();
    expect(tracker.operationIdFor({ ...draft, referencia: 'protocolo-124' })).toBe('operacao-3');
  });

  it('avisa que a decisão persistiu com dados possivelmente desatualizados e permite tentar a releitura', async () => {
    const retry = vi.fn(async () => undefined);
    hookState.resolveChargebackAndRefresh.mockResolvedValue({
      decision: { id: 'decisao-1' },
      refreshWarning: { message: 'falha ao reler dashboard', retry },
    });
    await act(async () => { renderer = create(createElement(FinanceiroPage)); });
    const page = renderer!;

    const form = page.root.findByType('form');
    await act(async () => { await form.props.onSubmit({ preventDefault: vi.fn() }); });

    expect(JSON.stringify(page.toJSON())).toContain(
      'A decisão foi registrada, mas os dados exibidos podem estar desatualizados',
    );
    expect(JSON.stringify(page.toJSON())).toContain('falha ao reler dashboard');
    const retryButton = page.root.findAllByType('button').find((button) => button.children.includes('Tentar atualizar dados'));
    expect(retryButton).toBeDefined();

    await act(async () => { await retryButton?.props.onClick(); });
    expect(retry).toHaveBeenCalledOnce();
    expect(page.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
  });

  it('mantém a ocorrência e a operação estável durante uma releitura rejeitada após decidir o chargeback', async () => {
    const operationIds: string[] = [];
    let finishRefresh!: (outcome: {
      decision: { id: string };
      refreshWarning: { message: string; retry: () => Promise<void> };
    }) => void;
    hookState.resolveChargebackAndRefresh.mockImplementation(async (input: { operacaoId: string }) => {
      operationIds.push(input.operacaoId);
      return new Promise((resolve) => { finishRefresh = resolve; });
    });
    await act(async () => { renderer = create(createElement(FinanceiroPage)); });
    const page = renderer!;
    const originalForm = page.root.findByType('form');

    await act(async () => {
      originalForm.props.onSubmit({ preventDefault: vi.fn() });
      await Promise.resolve();
    });

    hookState.loading = true;
    await act(async () => { page.update(createElement(FinanceiroPage)); });
    expect(page.root.findByType('form')).toBe(originalForm);

    hookState.loading = false;
    hookState.error = new Error('falha ao reler dashboard');
    await act(async () => {
      page.update(createElement(FinanceiroPage));
      finishRefresh({
        decision: { id: 'decisao-1' },
        refreshWarning: { message: 'falha ao reler dashboard', retry: async () => undefined },
      });
      await Promise.resolve();
    });

    expect(JSON.stringify(page.toJSON())).toContain(
      'A decisão foi registrada, mas os dados exibidos podem estar desatualizados',
    );
    const retryForm = page.root.findByType('form');
    hookState.resolveChargebackAndRefresh.mockImplementationOnce(async (input: { operacaoId: string }) => {
      operationIds.push(input.operacaoId);
      return { decision: { id: 'decisao-1' }, refreshWarning: null };
    });
    await act(async () => {
      retryForm.props.onSubmit({ preventDefault: vi.fn() });
      await Promise.resolve();
    });

    expect(operationIds).toHaveLength(2);
    expect(operationIds[1]).toBe(operationIds[0]);
  });

  it('avisa quando a reconciliação persistiu mas a releitura falhou e permite tentar novamente', async () => {
    const retry = vi.fn(async () => undefined);
    hookState.reconcilePaymentAndRefresh.mockResolvedValue({
      reconciliation: { resultado: 'recebido', pedidoId: 'pedido-1' },
      refreshWarning: { message: 'falha ao reler dashboard', retry },
    });
    await act(async () => { renderer = create(createElement(FinanceiroPage)); });
    const page = renderer!;
    const reconcileButton = page.root.findAllByType('button')
      .find((button) => button.children.includes('Reconciliar pagamento'));

    await act(async () => {
      reconcileButton?.props.onClick();
      await Promise.resolve();
    });

    const alert = page.root.findByProps({ role: 'alert' });
    expect(JSON.stringify(page.toJSON())).toContain('A reconciliação foi registrada');
    expect(JSON.stringify(page.toJSON())).toContain('falha ao reler dashboard');
    const retryButton = alert.findByType('button');

    await act(async () => { await retryButton.props.onClick(); });
    expect(retry).toHaveBeenCalledOnce();
    expect(page.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
  });
});
