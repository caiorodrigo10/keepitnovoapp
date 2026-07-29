'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Cliente, Estabelecimento, PedidoStatus } from '@keepit/core-data';

import { Badge } from '../../../src/components/Badge';
import { Card } from '../../../src/components/Card';
import { usePedidosAdmin } from '../../../src/hooks/useAdminOps';
import { getAdminDataClient } from '../../../src/lib/adminClient';
import { formatReais, PEDIDO_STATUS_LABEL } from '../../../src/lib/adminLabels';

const STATUS_OPTIONS: PedidoStatus[] = [
  'aguardando_pagamento',
  'aguardando_aceite',
  'aceito',
  'em_preparo',
  'saindo_hub',
  'no_hub',
  'entregue',
  'cancelado',
  'cancelado_timeout',
  'cancelado_atraso',
  'cancelado_admin',
  'recusado',
  'nao_retirado',
  'nao_entregue_lojista',
  'estornado_chargeback',
];

/**
 * Lista de pedidos (admin) — Épico 0, Story 0.13 (Task 4, AC1-3). Filtro por
 * `status` com os 15 valores exatos do enum `pedidos.status`
 * [Source: docs/architecture/03-data-models.md#5.1].
 */
export default function PedidosPage() {
  const searchParams = useSearchParams();
  const forceEmpty = searchParams.get('vazio') === '1';
  const forceError = searchParams.get('erro') === '1';
  const statusFiltro = (searchParams.get('status') as PedidoStatus | null) ?? undefined;

  const { data: pedidos, loading, error, refresh } = usePedidosAdmin(
    { status: statusFiltro },
    { forceEmpty, forceError },
  );

  const [clientesPorId, setClientesPorId] = useState<Record<string, Cliente>>({});
  const [lojasPorId, setLojasPorId] = useState<Record<string, Estabelecimento>>({});

  useEffect(() => {
    let cancelled = false;
    const client = getAdminDataClient();
    Promise.all([client.admin.listClientes(), client.admin.listAllEstabelecimentos()]).then(([clientes, lojas]) => {
      if (cancelled) return;
      setClientesPorId(Object.fromEntries(clientes.map((c) => [c.id, c])));
      setLojasPorId(Object.fromEntries(lojas.map((l) => [l.id, l])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Pedidos</h1>
        <p className="text-sm text-text-secondary">Todos os pedidos da plataforma, com filtro por status.</p>
      </div>

      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Status</span>
        <select
          defaultValue={statusFiltro ?? ''}
          onChange={(event) => {
            const url = new URL(window.location.href);
            if (event.target.value) {
              url.searchParams.set('status', event.target.value);
            } else {
              url.searchParams.delete('status');
            }
            window.location.href = url.toString();
          }}
          className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-brand focus:outline-none"
        >
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {PEDIDO_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </label>

      {loading && <p className="text-sm text-text-tertiary">Carregando pedidos…</p>}

      {!loading && error && (
        <Card className="border-accent-warning/40">
          <p className="mb-3 text-sm text-accent-warning">Erro ao carregar pedidos: {error.message}</p>
          <button
            type="button"
            onClick={refresh}
            className="text-sm font-semibold text-accent-brand underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </Card>
      )}

      {!loading && !error && pedidos.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">Nenhum pedido encontrado para este filtro.</p>
        </Card>
      )}

      {!loading && !error && pedidos.length > 0 && (
        <div className="flex flex-col gap-3">
          {pedidos.map((pedido) => (
            <Card key={pedido.id} className="flex items-center justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-base font-semibold text-text-primary">#{pedido.numero}</span>
                  <Badge variant={pedido.status === 'entregue' ? 'success' : 'neutral'}>
                    {PEDIDO_STATUS_LABEL[pedido.status]}
                  </Badge>
                </div>
                <p className="text-sm text-text-secondary">
                  {clientesPorId[pedido.cliente_id]?.nome ?? pedido.cliente_id} ·{' '}
                  {lojasPorId[pedido.estabelecimento_id]?.nome_fantasia ?? pedido.estabelecimento_id}
                </p>
                <p className="text-xs text-text-tertiary">{formatReais(pedido.total_pago_reais)}</p>
              </div>
              <Link
                href={`/pedidos/${pedido.id}`}
                className="shrink-0 rounded-sm bg-bg-elevated px-4 py-2 text-sm font-semibold text-text-primary hover:bg-bg-overlay"
              >
                Ver detalhe
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
