'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Card } from '../../../src/components/Card';
import { useFinancialDashboard } from '../../../src/hooks/useAdminOps';
import { formatReais } from '../../../src/lib/adminLabels';

const PERIODO_OPTIONS = [7, 30, 90] as const;

/**
 * Dashboard financeiro geral — Épico 0, Story 0.13 (Task 8, AC1-3). GMV e
 * Receita Keepit calculados 100% a partir de `pedidos.total_pago_reais` /
 * `pedidos.taxa_keepit_reais` de pedidos `entregue` no período selecionado
 * (mesmo padrão de seletor de período do Dashboard do Lojista, Story 0.11).
 * Ranking de lojas por GMV. Nenhum valor hardcoded — tudo vem do dado real.
 *
 * Story 8.7: contagens (pedidos/entregues/cancelados/no-show) + taxa de
 * sucesso adicionadas (SHOULD, decisão de @po — agregação barata sobre a
 * MESMA leitura de `pedidos`). Ranking de hubs por nº de pedidos e o
 * gráfico de linha (Recharts) ficam como DÉBITO NÃO-BLOQUEANTE (decisão de
 * @po registrada na Story 8.7) — não implementados nesta tela.
 */
export default function FinanceiroPage() {
  const searchParams = useSearchParams();
  const forceEmpty = searchParams.get('vazio') === '1';
  const forceError = searchParams.get('erro') === '1';

  const [periodoDias, setPeriodoDias] = useState<(typeof PERIODO_OPTIONS)[number]>(30);
  const { data: dashboard, loading, error, refresh } = useFinancialDashboard(periodoDias, {
    forceEmpty,
    forceError,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Financeiro</h1>
        <p className="text-sm text-text-secondary">GMV, receita Keepit e ranking de lojas por período.</p>
      </div>

      <div className="flex gap-2">
        {PERIODO_OPTIONS.map((dias) => (
          <button
            key={dias}
            type="button"
            onClick={() => setPeriodoDias(dias)}
            className={`rounded-sm px-4 py-2 text-sm font-semibold transition-opacity ${
              periodoDias === dias
                ? 'bg-accent-brand text-bg-shell'
                : 'bg-bg-elevated text-text-primary hover:bg-bg-overlay'
            }`}
          >
            {dias} dias
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-text-tertiary">Carregando dashboard…</p>}

      {!loading && error && (
        <Card className="border-accent-warning/40">
          <p className="mb-3 text-sm text-accent-warning">Erro ao carregar dashboard: {error.message}</p>
          <button
            type="button"
            onClick={refresh}
            className="text-sm font-semibold text-accent-brand underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </Card>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">GMV</p>
              <p className="mt-2 text-2xl font-bold text-text-primary">{formatReais(dashboard.gmvReais)}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Receita Keepit</p>
              <p className="mt-2 text-2xl font-bold text-accent-brand">{formatReais(dashboard.receitaKeepitReais)}</p>
            </Card>
          </div>

          {/* Story 8.7 (SHOULD) — contagens/taxa de sucesso, derivadas 100% de `pedidos` do período, nunca hardcoded. */}
          <div className="grid grid-cols-5 gap-4">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Pedidos</p>
              <p className="mt-2 text-xl font-bold text-text-primary">{dashboard.pedidosTotais}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Entregues</p>
              <p className="mt-2 text-xl font-bold text-text-primary">{dashboard.pedidosEntregues}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Cancelados</p>
              <p className="mt-2 text-xl font-bold text-text-primary">{dashboard.pedidosCancelados}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">No-show</p>
              <p className="mt-2 text-xl font-bold text-text-primary">{dashboard.pedidosNoShow}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Taxa de sucesso</p>
              <p className="mt-2 text-xl font-bold text-text-primary">{dashboard.taxaSucessoPercent.toFixed(1)}%</p>
            </Card>
          </div>

          <Card className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
              Ranking de lojas
            </h2>
            {dashboard.ranking.length === 0 ? (
              <p className="text-sm text-text-secondary">Nenhum pedido entregue no período.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {dashboard.ranking.map((entrada, index) => (
                  <li key={entrada.estabelecimento_id} className="flex items-center justify-between">
                    <span className="text-text-primary">
                      {index + 1}. {entrada.nome_fantasia}
                    </span>
                    <span className="text-text-secondary">
                      {formatReais(entrada.gmvReais)} · {entrada.pedidosEntregues} pedido(s)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
