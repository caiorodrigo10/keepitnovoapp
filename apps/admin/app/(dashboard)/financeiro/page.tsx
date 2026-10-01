'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { useFinancialDashboard } from '../../../src/hooks/useAdminOps';
import { getAdminDataClient } from '../../../src/lib/adminClient';
import { formatReais } from '../../../src/lib/adminLabels';
import { anticipationIdentityLabel } from '../../../src/lib/financialLabels';

const PERIODO_OPTIONS = [7, 30, 90] as const;

/** Visão financeira: vendas, receita bruta, taxas e obrigações são métricas distintas. */
export default function FinanceiroPage() {
  const searchParams = useSearchParams();
  const forceEmpty = searchParams.get('vazio') === '1';
  const forceError = searchParams.get('erro') === '1';

  const [periodoDias, setPeriodoDias] = useState<(typeof PERIODO_OPTIONS)[number]>(30);
  const [reconciliando, setReconciliando] = useState<string | null>(null);
  const [erroReconciliacao, setErroReconciliacao] = useState<string | null>(null);
  const { data: dashboard, loading, error, refresh } = useFinancialDashboard(periodoDias, {
    forceEmpty,
    forceError,
  });

  async function reconciliar(tentativaId: string) {
    setReconciliando(tentativaId);
    setErroReconciliacao(null);
    try {
      await getAdminDataClient().admin.reconcilePayment(tentativaId);
      refresh();
    } catch (cause) {
      setErroReconciliacao(cause instanceof Error ? cause.message : 'Não foi possível reconciliar a tentativa.');
    } finally {
      setReconciliando(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Financeiro</h1>
        <p className="text-sm text-text-secondary">Recebimentos, receita, custos e obrigações separados por fonte financeira.</p>
        <p className="text-xs text-text-tertiary">Caixa efetivo da Keepit exige conciliação com o extrato bancário; pagamentos confirmados e receita bruta não representam saldo disponível.</p>
      </div>

      <div className="flex gap-2">
        {PERIODO_OPTIONS.map((dias) => (
          <Button
            key={dias}
            variant={periodoDias === dias ? 'primary' : 'secondary'}
            onClick={() => setPeriodoDias(dias)}
          >
            {dias} dias
          </Button>
        ))}
      </div>

      {loading && <p className="text-sm text-text-tertiary">Carregando dashboard…</p>}

      {!loading && error && (
        <Card className="border-accent-warning/40">
          <p className="mb-3 text-sm text-accent-warning">Erro ao carregar dashboard: {error.message}</p>
          <Button variant="secondary" onClick={refresh}>
            Tentar novamente
          </Button>
        </Card>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Recebido dos clientes no período</p>
              <p className="mt-2 text-2xl font-bold text-text-primary">{formatReais(dashboard.recebidoClientesReais)}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">GMV entregue no período</p>
              <p className="mt-2 text-2xl font-bold text-text-primary">{formatReais(dashboard.gmvReais)}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Receita bruta Keepit · comissão + serviço</p>
              <p className="mt-2 text-2xl font-bold text-accent-brand">{formatReais(dashboard.receitaKeepitReais)}</p>
            </Card>
            <Card><p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Tarifas de antecipação registradas no gateway</p><p className="mt-2 text-2xl font-bold text-text-primary">{formatReais(dashboard.despesaGatewayReais)}</p></Card>
            <Card><p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Dívida líquida com lojistas · posição atual</p><p className="mt-2 text-2xl font-bold text-text-primary">{formatReais(dashboard.dividaLojistasReais)}</p><p className="mt-1 text-xs text-text-tertiary">Saldo negativo representa ajuste a compensar.</p></Card>
            <Card><p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Repasses pagos no período</p><p className="mt-2 text-2xl font-bold text-text-primary">{formatReais(dashboard.repassesPagosReais)}</p></Card>
            <Card><p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Reembolsos executados no período</p><p className="mt-2 text-2xl font-bold text-text-primary">{formatReais(dashboard.reembolsosReais)}</p></Card>
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

          <div className="grid grid-cols-2 gap-4">
            <Card className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
                Eventos com divergência
              </h2>
              {dashboard.eventosComErro.length === 0 ? (
                <p className="text-sm text-text-secondary">Nenhuma divergência de vínculo ou conteúdo.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {dashboard.eventosComErro.map((item) => (
                    <li key={item.eventoExternoId}>
                      <p className="font-medium text-text-primary">{item.tipo} · {item.erro}</p>
                      <p className="text-text-secondary">{item.cobrancaId ?? 'cobrança sem ID'} · {item.resultado}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
                Ocorrências de pagamento
              </h2>
              {dashboard.ocorrenciasPagamento.length === 0 ? (
                <p className="text-sm text-text-secondary">Nenhum chargeback, estorno ou pagamento tardio pendente.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {dashboard.ocorrenciasPagamento.map((item) => (
                    <li key={item.id}>
                      <p className="font-medium text-text-primary">{item.tipo} · {item.estado}</p>
                      <p className="text-text-secondary">Pedido {item.pedidoId} · {item.detalhe}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="flex flex-col gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
                Reconciliações de pagamento
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Tentativas incertas permanecem bloqueadas até uma consulta explícita ao gateway.
              </p>
            </div>
            {erroReconciliacao && <p className="text-sm text-accent-warning">{erroReconciliacao}</p>}
            {dashboard.reconciliacoes.length === 0 ? (
              <p className="text-sm text-text-secondary">Nenhuma tentativa aguardando reconciliação.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {dashboard.reconciliacoes.map((item) => (
                  <li key={item.tentativaId} className="flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-medium text-text-primary">Pedido {item.pedidoId}</p>
                      <p className="text-text-secondary">
                        {item.forma} · {item.asaasPaymentId ?? 'sem ID externo'} · {item.ultimoResultado ?? 'sem evento'}
                        {item.ultimoErro ? ` (${item.ultimoErro})` : ''}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={reconciliando === item.tentativaId}
                      onClick={() => void reconciliar(item.tentativaId)}
                    >
                      {reconciliando === item.tentativaId ? 'Consultando…' : 'Reconciliar'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
                Antecipações de recebíveis
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Visibilidade operacional; antecipação pendente não representa caixa disponível.
              </p>
            </div>
            {dashboard.antecipacoes.length === 0 ? (
              <p className="text-sm text-text-secondary">Nenhuma antecipação registrada.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {dashboard.antecipacoes.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1">
                    <p className="font-medium text-text-primary">
                      {anticipationIdentityLabel({
                        anticipationId: item.antecipacaoExternaId,
                        paymentId: item.cobrancaId,
                        orderId: item.pedidoId,
                      })}
                    </p>
                    <div className="grid grid-cols-5 gap-3">
                      <span className="text-text-primary">{item.estado}</span>
                      <span className="text-text-secondary">Bruto {formatReais(item.valorCentavos / 100)}</span>
                      <span className="text-text-secondary">Tarifa {formatReais(item.tarifaCentavos / 100)}</span>
                      <span className="text-text-secondary">Líquido {formatReais(item.liquidoCentavos / 100)}</span>
                      <span className="text-text-secondary">{item.dataCredito ?? 'crédito não confirmado'}</span>
                    </div>
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
