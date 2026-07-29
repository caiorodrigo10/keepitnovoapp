'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';

import type { Cliente, Estabelecimento, Hub, Pedido, PedidoStatus } from '@keepit/core-data';

import { Badge } from '../../../../src/components/Badge';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { getAdminDataClient } from '../../../../src/lib/adminClient';
import { formatDateTime, formatReais, PEDIDO_STATUS_LABEL } from '../../../../src/lib/adminLabels';

const TERMINAL_PEDIDO_STATUSES: ReadonlySet<PedidoStatus> = new Set([
  'entregue',
  'cancelado',
  'cancelado_timeout',
  'cancelado_atraso',
  'cancelado_admin',
  'recusado',
  'nao_retirado',
  'nao_entregue_lojista',
  'estornado_chargeback',
]);

const TIMELINE_FIELDS: Array<{ key: keyof Pedido; label: string }> = [
  { key: 'criado_em', label: 'Criado' },
  { key: 'aceito_em', label: 'Aceito' },
  { key: 'saiu_hub_em', label: 'Saiu do hub' },
  { key: 'lojista_chegou_em', label: 'Lojista chegou' },
  { key: 'cliente_chegou_em', label: 'Cliente chegou' },
  { key: 'entregue_em', label: 'Entregue' },
  { key: 'cancelado_em', label: 'Cancelado' },
];

/**
 * Detalhe do pedido + forçar cancelamento — Épico 0, Story 0.13 (Task 5,
 * AC1-3). "Forçar cancelamento" exige motivo obrigatório (espelha
 * `motivo_cancelamento`), transiciona para `cancelado_admin` e gera entrada
 * correspondente na fila de reembolsos (`admin.port.forceCancelOrder`,
 * promovido para `packages/core-data` na Story 1.10, Task 4). Desabilitado/
 * oculto para pedidos já em estado terminal.
 */
export default function DetalhePedidoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceActionError = searchParams.get('erro') === '1';

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loja, setLoja] = useState<Estabelecimento | null>(null);
  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [motivoTocado, setMotivoTocado] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const client = getAdminDataClient();
    Promise.all([
      client.order.getById(params.id),
      client.admin.listClientes(),
      client.admin.listAllEstabelecimentos(),
    ])
      .then(async ([pedidoResult, clientes, lojas]) => {
        if (cancelled) return;
        setPedido(pedidoResult);
        setCliente(clientes.find((c) => c.id === pedidoResult?.cliente_id) ?? null);
        setLoja(lojas.find((l) => l.id === pedidoResult?.estabelecimento_id) ?? null);
        if (pedidoResult) {
          const hubResult = await client.hub.getById(pedidoResult.hub_id);
          if (!cancelled) setHub(hubResult);
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error : new Error(String(error)));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  function handleForcarCancelamento() {
    setMotivoTocado(true);
    if (motivo.trim().length === 0) {
      return;
    }

    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.forceCancelOrder(params.id, motivo.trim(), { forceError: forceActionError })
      .then((atualizado) => {
        setActionPending(false);
        setPedido(atualizado);
        setShowForm(false);
        router.push('/pedidos');
      })
      .catch((error: unknown) => {
        setActionPending(false);
        setActionError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  if (loading) {
    return <p className="text-sm text-text-tertiary">Carregando pedido…</p>;
  }

  if (loadError || !pedido) {
    return (
      <Card className="border-accent-warning/40">
        <p className="text-sm text-accent-warning">
          {loadError ? `Erro ao carregar pedido: ${loadError.message}` : 'Pedido não encontrado.'}
        </p>
      </Card>
    );
  }

  const terminal = TERMINAL_PEDIDO_STATUSES.has(pedido.status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Pedido #{pedido.numero}</h1>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant={pedido.status === 'entregue' ? 'success' : 'neutral'}>
            {PEDIDO_STATUS_LABEL[pedido.status]}
          </Badge>
          <span className="text-xs uppercase tracking-section text-text-tertiary">
            {cliente?.nome ?? pedido.cliente_id} · {loja?.nome_fantasia ?? pedido.estabelecimento_id} ·{' '}
            {hub?.nome ?? pedido.hub_id}
          </span>
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Itens</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {pedido.itens.map((item) => (
            <li key={item.id} className="flex justify-between text-text-secondary">
              <span>
                {item.quantidade}× {item.nome_snapshot}
              </span>
              <span className="text-text-primary">{formatReais(item.subtotal_reais)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-border-default pt-2 text-sm font-semibold text-text-primary">
          <span>Total pago</span>
          <span>{formatReais(pedido.total_pago_reais)}</span>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Linha do tempo</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {TIMELINE_FIELDS.filter((field) => pedido[field.key]).map((field) => (
            <Fragment key={field.key}>
              <dt className="text-text-tertiary">{field.label}</dt>
              <dd className="text-text-primary">{formatDateTime(pedido[field.key] as string)}</dd>
            </Fragment>
          ))}
        </dl>
        {pedido.motivo_cancelamento && (
          <p className="text-sm text-text-secondary">
            <span className="text-text-tertiary">Motivo do cancelamento: </span>
            {pedido.motivo_cancelamento}
          </p>
        )}
      </Card>

      {actionError && (
        <Card className="border-accent-warning/40">
          <p className="text-sm text-accent-warning">Falha ao processar ação: {actionError.message}</p>
        </Card>
      )}

      {!terminal && !showForm && (
        <div>
          <Button variant="danger" onClick={() => setShowForm(true)}>
            Forçar cancelamento
          </Button>
        </div>
      )}

      {!terminal && showForm && (
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
              Motivo do cancelamento (obrigatório)
            </span>
            <textarea
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              onBlur={() => setMotivoTocado(true)}
              rows={3}
              placeholder="Explique por que este pedido está sendo cancelado pelo admin…"
              className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
            />
            {motivoTocado && motivo.trim().length === 0 && (
              <span className="text-xs text-accent-warning">Motivo é obrigatório para forçar o cancelamento.</span>
            )}
          </label>
          <div className="flex gap-3">
            <Button
              variant="danger"
              onClick={handleForcarCancelamento}
              disabled={actionPending || motivo.trim().length === 0}
            >
              {actionPending ? 'Cancelando…' : 'Confirmar cancelamento'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setMotivo('');
                setMotivoTocado(false);
              }}
              disabled={actionPending}
            >
              Cancelar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
