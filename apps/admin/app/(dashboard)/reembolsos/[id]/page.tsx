'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Pedido, ReembolsoPendente } from '@keepit/core-data';

import { Badge } from '../../../../src/components/Badge';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { getAdminDataClient } from '../../../../src/lib/adminClient';
import { formatReais, REEMBOLSO_MOTIVO_LABEL } from '../../../../src/lib/adminLabels';

/**
 * Executar reembolso — Épico 0, Story 0.13 (Task 3, AC1-3), religado para
 * `client.admin.refundQueue` (Story 1.10, Task 4). "Confirmar estorno" chama
 * `refundQueue.process` (transição `pendente_admin -> estornado`).
 *
 * `?erro=1` na URL passa `{ forceError: true }` para `refundQueue.process`
 * (mesmo mecanismo de `AsyncCallOptions` das demais ports) para exercitar o
 * estado de erro exigido pela Task 3/AC3 — a Promise rejeita e o card de
 * erro genérico (mesmo usado para falha de carregamento) é exibido.
 */
export default function ExecutarReembolsoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceActionError = searchParams.get('erro') === '1';

  const [reembolso, setReembolso] = useState<ReembolsoPendente | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [showErroForm, setShowErroForm] = useState(false);
  const [detalheErro, setDetalheErro] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const client = getAdminDataClient();
    client.admin.refundQueue
      .list()
      .then(async (reembolsos) => {
        if (cancelled) return;
        const encontrado = reembolsos.find((r) => r.id === params.id) ?? null;
        setReembolso(encontrado);
        if (encontrado) {
          const p = await client.order.getById(encontrado.pedido_id);
          if (!cancelled) setPedido(p);
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

  /**
   * Story 8.2 (AC2) — "Confirmar estorno" registra a confirmação MANUAL
   * auditável (`resultado: 'concluido'`) — **nenhuma chamada Asaas real**
   * (seam honesta, ver Story 8.2 "Ajuste de piloto"). O admin confirma que
   * já fez (ou vai fazer) o PIX/estorno de fato fora do sistema.
   */
  function handleConfirmarEstorno() {
    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.refundQueue.process(params.id, 'concluido', undefined, { forceError: forceActionError })
      .then((atualizado) => {
        setActionPending(false);
        setReembolso(atualizado);
        router.push('/reembolsos');
      })
      .catch((error: unknown) => {
        setActionPending(false);
        setActionError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  /**
   * Story 8.2 (AC2) — caminho de falha: o PIX/estorno manual não deu certo
   * (dados bancários incorretos, etc.). Registra `resultado: 'erro'` com
   * `detalhe` — nenhum sucesso fictício é exibido.
   */
  function handleMarcarErro() {
    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.refundQueue.process(params.id, 'erro', detalheErro.trim() || undefined, { forceError: forceActionError })
      .then((atualizado) => {
        setActionPending(false);
        setReembolso(atualizado);
        setShowErroForm(false);
      })
      .catch((error: unknown) => {
        setActionPending(false);
        setActionError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  if (loading) {
    return <p className="text-sm text-text-tertiary">Carregando reembolso…</p>;
  }

  if (loadError || !reembolso) {
    return (
      <Card className="border-accent-warning/40">
        <p className="text-sm text-accent-warning">
          {loadError ? `Erro ao carregar reembolso: ${loadError.message}` : 'Reembolso não encontrado.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Executar Reembolso</h1>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="warning">{REEMBOLSO_MOTIVO_LABEL[reembolso.motivo]}</Badge>
          <Badge variant="neutral">{reembolso.status}</Badge>
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
          Pedido vinculado
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-tertiary">Número</dt>
          <dd className="text-text-primary">#{pedido?.numero ?? '—'}</dd>
          <dt className="text-text-tertiary">Forma de pagamento</dt>
          <dd className="text-text-primary">{reembolso.forma_pagamento.toUpperCase()}</dd>
          <dt className="text-text-tertiary">Valor a estornar</dt>
          <dd className="text-text-primary">{formatReais(reembolso.valor_a_estornar_reais)}</dd>
          <dt className="text-text-tertiary">Valor ao lojista</dt>
          <dd className="text-text-primary">{formatReais(reembolso.valor_ao_lojista_reais)}</dd>
        </dl>
      </Card>

      {actionError && (
        <Card className="border-accent-warning/40">
          <p className="text-sm text-accent-warning">Erro ao processar ação: {actionError.message}</p>
        </Card>
      )}

      {reembolso.status !== 'estornado' && reembolso.status !== 'erro' && !showErroForm && (
        <div className="flex gap-3">
          <Button onClick={handleConfirmarEstorno} disabled={actionPending}>
            {actionPending ? 'Processando…' : 'Confirmar estorno'}
          </Button>
          <Button variant="secondary" onClick={() => setShowErroForm(true)} disabled={actionPending}>
            Marcar como erro
          </Button>
        </div>
      )}

      {reembolso.status !== 'estornado' && reembolso.status !== 'erro' && showErroForm && (
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
              Detalhe do erro (opcional)
            </span>
            <textarea
              value={detalheErro}
              onChange={(event) => setDetalheErro(event.target.value)}
              rows={2}
              placeholder="Ex.: dados bancários incorretos, PIX manual falhou…"
              className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
            />
          </label>
          <div className="flex gap-3">
            <Button variant="danger" onClick={handleMarcarErro} disabled={actionPending}>
              {actionPending ? 'Registrando…' : 'Confirmar erro'}
            </Button>
            <Button variant="secondary" onClick={() => setShowErroForm(false)} disabled={actionPending}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
