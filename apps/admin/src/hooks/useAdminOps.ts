'use client';

import { useCallback, useState } from 'react';

import type {
  AsyncCallOptions,
  Cliente,
  DecideChargebackInput,
  Estabelecimento,
  EstabelecimentoFalha,
  FinancialDashboardResult,
  Pedido,
  PedidoStatus,
  ReembolsoPendente,
  Repasse,
} from '@keepit/core-data';
import { useAsyncResource, type AsyncResourceState } from '@keepit/core-data/hooks';

import { getAdminDataClient } from '../lib/adminClient';

/**
 * Hooks locais do Admin (Story 0.13), religados para `client.admin` real
 * (Story 1.10, Task 4) — antes consumiam `../mock/adminOpsMock` (mock local
 * do app, removido nesta story).
 *
 * [IDS] REUSE: reutiliza `useAsyncResource` de `@keepit/core-data/hooks`
 * (mesmo hook genérico usado por `useAdminPendingStores`/`useAdminHubs` na
 * Story 0.12) — nenhuma lógica de loading/erro/refresh duplicada, só o
 * `fetcher` muda.
 */

export interface RefreshableAsyncResource<T> extends AsyncResourceState<T> {
  refresh: () => void;
  refreshAndWait: () => Promise<void>;
}

type RefreshRequest = {
  resolve: () => void;
  reject: (cause: unknown) => void;
};

function useRefreshable<T>(
  fetcher: () => Promise<T>,
  initialValue: T,
  extraDeps: ReadonlyArray<unknown>,
): RefreshableAsyncResource<T> {
  const [refreshRequest, setRefreshRequest] = useState<RefreshRequest | null>(null);
  const state = useAsyncResource<T>(async () => {
    try {
      const data = await fetcher();
      refreshRequest?.resolve();
      return data;
    } catch (cause) {
      refreshRequest?.reject(cause);
      throw cause;
    }
  }, initialValue, [refreshRequest, ...extraDeps]);
  const refreshAndWait = useCallback(() => new Promise<void>((resolve, reject) => {
    setRefreshRequest({ resolve, reject });
  }), []);
  const refresh = useCallback(() => {
    void refreshAndWait().catch(() => undefined);
  }, [refreshAndWait]);
  return { ...state, refresh, refreshAndWait };
}

export function useRefundQueue(options?: AsyncCallOptions): RefreshableAsyncResource<ReembolsoPendente[]> {
  return useRefreshable<ReembolsoPendente[]>(
    () => getAdminDataClient().admin.refundQueue.list(options),
    [],
    [options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}

/** Lotes semanais materializados e previsões, sem a fila legada de saques avulsos. */
export function useRepasses(options?: AsyncCallOptions): RefreshableAsyncResource<Repasse[]> {
  return useRefreshable<Repasse[]>(
    async () => {
      if (options?.forceError) throw new Error('Falha simulada ao carregar repasses.');
      return options?.forceEmpty ? [] : getAdminDataClient().payout.listar();
    },
    [],
    [options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}

export function usePedidosAdmin(
  filtros?: { status?: PedidoStatus },
  options?: AsyncCallOptions,
): RefreshableAsyncResource<Pedido[]> {
  return useRefreshable<Pedido[]>(
    () => getAdminDataClient().admin.listAllOrders(filtros, options),
    [],
    [filtros?.status, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}

export function useClientesOps(
  filtros?: { busca?: string },
  options?: AsyncCallOptions,
): RefreshableAsyncResource<Cliente[]> {
  return useRefreshable<Cliente[]>(
    () => getAdminDataClient().admin.listClientes(filtros, options),
    [],
    [filtros?.busca, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}

export function useLojistasOps(options?: AsyncCallOptions): RefreshableAsyncResource<Estabelecimento[]> {
  return useRefreshable<Estabelecimento[]>(
    () => getAdminDataClient().admin.listAllEstabelecimentos(options),
    [],
    [options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}

export function useLojistaQuality(
  estabelecimentoId: string,
  options?: AsyncCallOptions,
): RefreshableAsyncResource<EstabelecimentoFalha[]> {
  return useRefreshable<EstabelecimentoFalha[]>(
    () => getAdminDataClient().admin.lojistaQualityView(estabelecimentoId, options),
    [],
    [estabelecimentoId, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}

const EMPTY_LOJISTA_ORDER_COUNTS = { entregues: 0, cancelados: 0, noShow: 0 };

/** Story 8.8 (AC1) — contagens entregues/cancelados/no-show por lojista. */
export function useLojistaOrderCounts(
  estabelecimentoId: string,
  options?: AsyncCallOptions,
): RefreshableAsyncResource<{ entregues: number; cancelados: number; noShow: number }> {
  return useRefreshable<{ entregues: number; cancelados: number; noShow: number }>(
    () => getAdminDataClient().admin.lojistaOrderCounts(estabelecimentoId, options),
    EMPTY_LOJISTA_ORDER_COUNTS,
    [estabelecimentoId, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}

const EMPTY_FINANCIAL_DASHBOARD: FinancialDashboardResult = {
  periodoDias: 0,
  gmvReais: 0,
  recebidoClientesReais: 0,
  receitaKeepitReais: 0,
  despesaGatewayReais: 0,
  dividaLojistasReais: 0,
  repassesPagosReais: 0,
  reembolsosReais: 0,
  ranking: [],
  pedidosTotais: 0,
  pedidosEntregues: 0,
  pedidosCancelados: 0,
  pedidosNoShow: 0,
  taxaSucessoPercent: 0,
  reconciliacoes: [],
  antecipacoes: [],
  eventosComErro: [],
  ocorrenciasPagamento: [],
  pendenciasFinanceiras: [],
};

export function useFinancialDashboard(
  periodoDias: number,
  options?: AsyncCallOptions,
): RefreshableAsyncResource<FinancialDashboardResult> {
  return useRefreshable<FinancialDashboardResult>(
    () => getAdminDataClient().admin.financialDashboard(periodoDias, options),
    EMPTY_FINANCIAL_DASHBOARD,
    [periodoDias, options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}

export async function reconcilePaymentAndRefresh(
  tentativaId: string,
  refresh: () => void | Promise<void>,
  reconcilePayment = (id: string) => getAdminDataClient().admin.reconcilePayment(id),
) {
  let result: Awaited<ReturnType<typeof reconcilePayment>>;
  try {
    result = await reconcilePayment(tentativaId);
  } catch (mutationError) {
    try {
      await refresh();
    } catch {
      // A falha original da mutação é a informação operacional relevante.
    }
    throw mutationError;
  }
  try {
    await refresh();
    return { reconciliation: result, refreshWarning: null };
  } catch (refreshError) {
    const error = refreshError instanceof Error ? refreshError : new Error(String(refreshError));
    return {
      reconciliation: result,
      refreshWarning: {
        message: error.message,
        retry: async () => { await refresh(); },
      },
    };
  }
}

export async function resolveChargebackAndRefresh(
  input: DecideChargebackInput,
  refresh: () => void | Promise<void>,
  resolveChargeback = (value: DecideChargebackInput) => getAdminDataClient().admin.decideChargeback(value),
) {
  let result: Awaited<ReturnType<typeof resolveChargeback>>;
  try {
    result = await resolveChargeback(input);
  } catch (mutationError) {
    try {
      await refresh();
    } catch {
      // A falha original da mutação é a informação operacional relevante.
    }
    throw mutationError;
  }
  try {
    await refresh();
    return { decision: result, refreshWarning: null };
  } catch (refreshError) {
    const error = refreshError instanceof Error ? refreshError : new Error(String(refreshError));
    return {
      decision: result,
      refreshWarning: {
        message: error.message,
        retry: async () => { await refresh(); },
      },
    };
  }
}
