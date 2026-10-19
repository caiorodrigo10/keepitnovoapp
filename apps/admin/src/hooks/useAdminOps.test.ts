import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  reconcileCardValidationAndRefresh,
  reconcilePaymentAndRefresh,
  resolveChargebackAndRefresh,
  useFinancialDashboard,
  useLojistaOrderCounts,
  useLojistaQuality,
} from './useAdminOps';

const adminClient = vi.hoisted(() => ({
  financialDashboard: vi.fn(),
  lojistaOrderCounts: vi.fn(),
  lojistaQualityView: vi.fn(),
}));
vi.mock('../lib/adminClient', () => ({
  getAdminDataClient: () => ({ admin: adminClient }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | undefined;
let dashboardResource: ReturnType<typeof useFinancialDashboard>;

function DashboardHarness() {
  dashboardResource = useFinancialDashboard(30);
  return null;
}

function EmptyLojistaHarness() {
  useLojistaQuality('');
  useLojistaOrderCounts('');
  return null;
}

afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
});

describe('reconcilePaymentAndRefresh', () => {
  it('relê a fila persistida após uma reconciliação concluída', async () => {
    const reconcilePayment = vi.fn(async () => ({ resultado: 'recebido', pedidoId: 'pedido-1' }));
    const refresh = vi.fn();

    await expect(reconcilePaymentAndRefresh('tentativa-1', refresh, reconcilePayment)).resolves.toMatchObject({
      reconciliation: { resultado: 'recebido' },
      refreshWarning: null,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('relê a fila persistida após resposta ambígua ou perdida', async () => {
    const reconcilePayment = vi.fn(async () => {
      throw new Error('COBRANCA_AMBIGUA');
    });
    const refresh = vi.fn();

    let rejected = false;
    try {
      await reconcilePaymentAndRefresh('tentativa-1', refresh, reconcilePayment);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('preserva a reconciliação concluída quando a releitura posterior falha', async () => {
    const committed = { resultado: 'recebido', pedidoId: 'pedido-1' };
    const reconcilePayment = vi.fn(async () => committed);
    let refreshFails = true;
    const refresh = vi.fn(async () => {
      if (refreshFails) throw new Error('falha ao reler dashboard');
    });

    const outcome = await reconcilePaymentAndRefresh('tentativa-1', refresh, reconcilePayment);

    expect(outcome.reconciliation).toEqual(committed);
    expect(outcome.refreshWarning?.message).toBe('falha ao reler dashboard');
    refreshFails = false;
    await expect(outcome.refreshWarning?.retry()).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('preserva o erro da mutação quando a releitura também falha', async () => {
    const mutationError = new Error('COBRANCA_AMBIGUA');
    const reconcilePayment = vi.fn(async () => { throw mutationError; });
    const refresh = vi.fn(async () => { throw new Error('falha ao reler dashboard'); });

    await expect(reconcilePaymentAndRefresh('tentativa-1', refresh, reconcilePayment))
      .rejects.toBe(mutationError);
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe('reconcileCardValidationAndRefresh', () => {
  it('refetches the public Admin queue after reconciling a validation', async () => {
    const reconcile = vi.fn(async () => ({ id: 'operacao-1', estado: 'estorno_pendente', valorCentavos: 137 }));
    const refresh = vi.fn();
    await expect(reconcileCardValidationAndRefresh('operacao-1', refresh, reconcile)).resolves.toMatchObject({
      reconciliation: { id: 'operacao-1', estado: 'estorno_pendente' }, refreshWarning: null,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe('resolveChargebackAndRefresh', () => {
  it('relê as ocorrências depois da decisão administrativa', async () => {
    const resolveChargeback = vi.fn(async () => ({
      id: 'decisao-1', ocorrenciaId: 'ocorrencia-1', responsavelPrincipal: 'lojista' as const,
      motivo: 'Entrega não comprovada', referencia: 'protocolo-123',
      principalInformadoCentavos: 10_790, principalDebitadoCentavos: 9_500,
      taxaCentavos: 4_000, lancamentoId: 'ajuste-1', criadoEm: '2026-10-01T12:00:00Z',
    }));
    const refresh = vi.fn();
    const input = {
      ocorrenciaId: 'ocorrencia-1', responsavelPrincipal: 'lojista' as const,
      motivo: 'Entrega não comprovada', referencia: 'protocolo-123',
      principalCentavos: 10_790, operacaoId: 'operacao-1',
    };

    await expect(resolveChargebackAndRefresh(input, refresh, resolveChargeback))
      .resolves.toMatchObject({ decision: { id: 'decisao-1' }, refreshWarning: null });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('preserva o sucesso confirmado quando a releitura posterior falha', async () => {
    const committed = {
      id: 'decisao-1', ocorrenciaId: 'ocorrencia-1', responsavelPrincipal: 'lojista' as const,
      motivo: 'Entrega não comprovada', referencia: 'protocolo-123',
      principalInformadoCentavos: 10_790, principalDebitadoCentavos: 9_500,
      taxaCentavos: 4_000, lancamentoId: 'ajuste-1', criadoEm: '2026-10-01T12:00:00Z',
    };
    const resolveChargeback = vi.fn(async () => committed);
    let refreshFails = true;
    const refresh = vi.fn(async () => {
      if (refreshFails) throw new Error('falha ao reler dashboard');
    });
    const input = {
      ocorrenciaId: 'ocorrencia-1', responsavelPrincipal: 'lojista' as const,
      motivo: 'Entrega não comprovada', referencia: 'protocolo-123',
      principalCentavos: 10_790, operacaoId: 'operacao-estavel',
    };

    const outcome = await resolveChargebackAndRefresh(input, refresh, resolveChargeback);

    expect(outcome.decision).toEqual(committed);
    expect(outcome.refreshWarning?.message).toBe('falha ao reler dashboard');
    refreshFails = false;
    await expect(outcome.refreshWarning?.retry()).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('useFinancialDashboard', () => {
  it('mantém os dados durante a releitura e rejeita com a falha apresentada no recurso', async () => {
    let rejectRefresh!: (cause: Error) => void;
    adminClient.financialDashboard
      .mockResolvedValueOnce({ periodoDias: 30 })
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectRefresh = reject; }));
    await act(async () => { renderer = create(React.createElement(DashboardHarness)); });

    let refreshPromise!: Promise<void>;
    await act(async () => {
      refreshPromise = dashboardResource.refreshAndWait();
      void refreshPromise.catch(() => undefined);
    });
    expect(dashboardResource.loading).toBe(true);
    expect(dashboardResource.data.periodoDias).toBe(30);

    await act(async () => { rejectRefresh(new Error('falha ao reler dashboard')); });

    await expect(refreshPromise).rejects.toThrow('falha ao reler dashboard');
    expect(dashboardResource.error?.message).toBe('falha ao reler dashboard');
    expect(dashboardResource.data.periodoDias).toBe(30);
    expect(adminClient.financialDashboard).toHaveBeenCalledTimes(2);
  });
});

describe('qualidade do lojista sem seleção', () => {
  it('não consulta qualidade nem contagens com estabelecimento_id vazio', async () => {
    await act(async () => { renderer = create(React.createElement(EmptyLojistaHarness)); });

    expect(adminClient.lojistaQualityView).not.toHaveBeenCalled();
    expect(adminClient.lojistaOrderCounts).not.toHaveBeenCalled();
  });
});
