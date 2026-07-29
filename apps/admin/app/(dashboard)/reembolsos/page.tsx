'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Pedido } from '@keepit/core-data';

import { Badge } from '../../../src/components/Badge';
import { Card } from '../../../src/components/Card';
import { useRefundQueue } from '../../../src/hooks/useAdminOps';
import { getAdminDataClient } from '../../../src/lib/adminClient';
import { formatReais, REEMBOLSO_MOTIVO_LABEL } from '../../../src/lib/adminLabels';

/**
 * Fila de reembolsos — Épico 0, Story 0.13 (Task 2, AC1-3). Lista
 * `reembolsos_pendentes` com `status = 'pendente_admin'`, ordenados por
 * `criado_em` (mais antigo primeiro), espelhando `idx_reembolsos_pendentes`.
 *
 * Dados vêm de `client.admin.refundQueue` real (Story 1.10, Task 4) — antes
 * de um mock local do Admin, já que `db.reembolsos` nunca era populado
 * organicamente (Story 0.13). Agora `db.reembolsos` é populado tanto por
 * seed inicial quanto pelas transições de cancelamento/recusa/no-show.
 *
 * `?vazio=1` / `?erro=1` exercitam os estados vazio/erro (mesmo padrão da
 * Story 0.12).
 */
export default function ReembolsosPage() {
  const searchParams = useSearchParams();
  const forceEmpty = searchParams.get('vazio') === '1';
  const forceError = searchParams.get('erro') === '1';

  const { data: reembolsos, loading, error, refresh } = useRefundQueue({ forceEmpty, forceError });
  const [pedidosPorId, setPedidosPorId] = useState<Record<string, Pedido>>({});

  useEffect(() => {
    let cancelled = false;
    const client = getAdminDataClient();
    Promise.all(reembolsos.map((r) => client.order.getById(r.pedido_id))).then((pedidos) => {
      if (cancelled) return;
      const map: Record<string, Pedido> = {};
      pedidos.forEach((pedido) => {
        if (pedido) map[pedido.id] = pedido;
      });
      setPedidosPorId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [reembolsos]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Fila de Reembolsos</h1>
        <p className="text-sm text-text-secondary">Reembolsos pendentes de processamento manual.</p>
      </div>

      {loading && <p className="text-sm text-text-tertiary">Carregando reembolsos…</p>}

      {!loading && error && (
        <Card className="border-accent-warning/40">
          <p className="mb-3 text-sm text-accent-warning">Erro ao carregar reembolsos: {error.message}</p>
          <button
            type="button"
            onClick={refresh}
            className="text-sm font-semibold text-accent-brand underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </Card>
      )}

      {!loading && !error && reembolsos.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">Nenhum reembolso pendente.</p>
        </Card>
      )}

      {!loading && !error && reembolsos.length > 0 && (
        <div className="flex flex-col gap-3">
          {reembolsos.map((reembolso) => {
            const pedido = pedidosPorId[reembolso.pedido_id];
            return (
              <Card key={reembolso.id} className="flex items-center justify-between gap-4">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-base font-semibold text-text-primary">
                      Pedido #{pedido?.numero ?? '—'}
                    </span>
                    <Badge variant="warning">{REEMBOLSO_MOTIVO_LABEL[reembolso.motivo]}</Badge>
                  </div>
                  <p className="text-sm text-text-secondary">
                    {formatReais(reembolso.valor_a_estornar_reais)} · {reembolso.forma_pagamento.toUpperCase()}
                  </p>
                </div>
                <Link
                  href={`/reembolsos/${reembolso.id}`}
                  className="shrink-0 rounded-sm bg-accent-brand px-4 py-2 text-sm font-semibold text-bg-shell hover:opacity-90"
                >
                  Processar
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
