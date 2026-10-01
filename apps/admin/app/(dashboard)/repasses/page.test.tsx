import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../src/hooks/useAdminOps', () => ({ useRepasses: () => ({
  data: [{ id: 'lote-1', estabelecimentoId: 'loja-1', semanaInicio: '2026-09-28', previstoPara: '2026-10-09',
    valorCentavos: 9500, estado: 'pendente', destinatarioNome: 'Loja A' }],
  loading: false, error: null, refresh: vi.fn(),
}) }));
vi.mock('../../../src/lib/adminClient', () => ({ getAdminDataClient: vi.fn() }));

import RepassesPage from './page';

describe('fila administrativa de repasses', () => {
  it('mostra lotes do PayoutPort como operação semanal, com detalhe por lote', () => {
    const html = renderToStaticMarkup(createElement(RepassesPage));
    expect(html).toContain('Repasses semanais');
    expect(html).toContain('Aguardando PIX');
    expect(html).toContain('/repasses/lote-1');
    expect(html).not.toContain('Fila de Saques');
  });
});
