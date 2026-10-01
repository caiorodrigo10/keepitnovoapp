import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../src/hooks/useAdminOps', () => ({ useFinancialDashboard: () => ({
  data: { periodoDias: 30, gmvReais: 107.9, recebidoClientesReais: 107.9,
    receitaKeepitReais: 12.9, despesaGatewayReais: 3.5, dividaLojistasReais: 95,
    repassesPagosReais: 0, reembolsosReais: 0, ranking: [], pedidosTotais: 1,
    pedidosEntregues: 1, pedidosCancelados: 0, pedidosNoShow: 0, taxaSucessoPercent: 100,
    reconciliacoes: [], antecipacoes: [], eventosComErro: [], ocorrenciasPagamento: [] },
  loading: false, error: null, refresh: vi.fn(),
}) }));
vi.mock('../../../src/lib/adminClient', () => ({ getAdminDataClient: vi.fn() }));

import FinanceiroPage from './page';

describe('dashboard financeiro Admin', () => {
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
});
