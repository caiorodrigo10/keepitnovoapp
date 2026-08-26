'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Estabelecimento } from '@keepit/core-data';

import { Badge } from '../../../src/components/Badge';
import { Card } from '../../../src/components/Card';
import { usePayoutQueue } from '../../../src/hooks/useAdminOps';
import { getAdminDataClient } from '../../../src/lib/adminClient';
import { formatDateTime, formatReais, SAQUE_STATUS_LABEL } from '../../../src/lib/adminLabels';

/**
 * Fila de saques — Story 8.9. Fecha o loop financeiro do Bloco 08:
 * `solicitar_saque` (Story 7.8, Done) já produz lançamentos `tipo='payout'
 * status='pendente'` no ledger; esta tela é o primeiro consumidor
 * administrativo deles. [IDS] ADAPT do padrão estrutural de `/reembolsos`
 * (Story 8.1) — mesma UI de fila com ação + confirmação, ângulo lojista em
 * vez de pedido. Ordenado por `criado_em asc` (mais antigos primeiro),
 * espelha `idx_lancamentos_pendentes` (mesmo padrão de `/reembolsos`).
 *
 * `?vazio=1` / `?erro=1` exercitam os estados vazio/erro, mesmo padrão das
 * demais telas do Admin.
 */
export default function SaquesPage() {
  const searchParams = useSearchParams();
  const forceEmpty = searchParams.get('vazio') === '1';
  const forceError = searchParams.get('erro') === '1';

  const { data: saques, loading, error, refresh } = usePayoutQueue({ forceEmpty, forceError });
  const [lojasPorId, setLojasPorId] = useState<Record<string, Estabelecimento>>({});

  useEffect(() => {
    let cancelled = false;
    getAdminDataClient()
      .admin.listAllEstabelecimentos()
      .then((lojas) => {
        if (cancelled) return;
        setLojasPorId(Object.fromEntries(lojas.map((l) => [l.id, l])));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Fila de Saques</h1>
        <p className="text-sm text-text-secondary">Saques dos lojistas pendentes de execução manual (PIX).</p>
      </div>

      {loading && <p className="text-sm text-text-tertiary">Carregando saques…</p>}

      {!loading && error && (
        <Card className="border-accent-warning/40">
          <p className="mb-3 text-sm text-accent-warning">Erro ao carregar saques: {error.message}</p>
          <button
            type="button"
            onClick={refresh}
            className="text-sm font-semibold text-accent-brand underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </Card>
      )}

      {!loading && !error && saques.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">Nenhum saque pendente.</p>
        </Card>
      )}

      {!loading && !error && saques.length > 0 && (
        <div className="flex flex-col gap-3">
          {saques.map((saque) => (
            <Card key={saque.id} className="flex items-center justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-base font-semibold text-text-primary">
                    {lojasPorId[saque.estabelecimento_id]?.nome_fantasia ?? saque.estabelecimento_id}
                  </span>
                  <Badge variant="warning">{SAQUE_STATUS_LABEL[saque.status]}</Badge>
                </div>
                <p className="text-sm text-text-secondary">
                  {formatReais(saque.valor_reais)} · Solicitado em {formatDateTime(saque.solicitado_em)}
                </p>
              </div>
              <Link
                href={`/saques/${saque.id}`}
                className="shrink-0 rounded-sm bg-accent-brand px-4 py-2 text-sm font-semibold text-bg-shell hover:opacity-90"
              >
                Processar
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
