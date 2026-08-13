'use client';

import { useCallback, useState } from 'react';

import type {
  AsyncCallOptions,
  Cliente,
  Estabelecimento,
  EstabelecimentoFalha,
  FinancialDashboardResult,
  Pedido,
  PedidoStatus,
  ReembolsoPendente,
  Saque,
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
}

function useRefreshable<T>(
  fetcher: () => Promise<T>,
  initialValue: T,
  extraDeps: ReadonlyArray<unknown>,
): RefreshableAsyncResource<T> {
  const [refreshToken, setRefreshToken] = useState(0);
  const state = useAsyncResource<T>(fetcher, initialValue, [refreshToken, ...extraDeps]);
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);
  return { ...state, refresh };
}

export function useRefundQueue(options?: AsyncCallOptions): RefreshableAsyncResource<ReembolsoPendente[]> {
  return useRefreshable<ReembolsoPendente[]>(
    () => getAdminDataClient().admin.refundQueue.list(options),
    [],
    [options?.forceEmpty, options?.forceError, options?.delayMs],
  );
}

/** Story 8.9 — fila administrativa de saques, mesmo padrão de `useRefundQueue`. */
export function usePayoutQueue(options?: AsyncCallOptions): RefreshableAsyncResource<Saque[]> {
  return useRefreshable<Saque[]>(
    () => getAdminDataClient().admin.payoutQueue.list(options),
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
  receitaKeepitReais: 0,
  ranking: [],
  pedidosTotais: 0,
  pedidosEntregues: 0,
  pedidosCancelados: 0,
  pedidosNoShow: 0,
  taxaSucessoPercent: 0,
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
