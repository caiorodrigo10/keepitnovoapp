'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { AdminPaymentInspection, Pedido, ReembolsoPendente } from '@keepit/core-data';

import { Badge } from '../../../../src/components/Badge';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { getAdminDataClient } from '../../../../src/lib/adminClient';
import { formatReais, REEMBOLSO_MOTIVO_LABEL } from '../../../../src/lib/adminLabels';
import { presentPaymentInspection } from '../../../../src/lib/paymentInspection';
import { loadRefundDetail } from '../../../../src/lib/refundDetail';

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
  const [payment, setPayment] = useState<AdminPaymentInspection | null>(null);
  const [restanteCentavos, setRestanteCentavos] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [showErroForm, setShowErroForm] = useState(false);
  const [detalheErro, setDetalheErro] = useState('');
  const [referencia, setReferencia] = useState('');
  const [comprovacao, setComprovacao] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const client = getAdminDataClient();
    loadRefundDetail(client, params.id)
      .then(({ reembolso: encontrado, pedido: pedidoEncontrado, payment: pagamentoEncontrado, restanteCentavos: restante }) => {
        if (cancelled) return;
        setReembolso(encontrado);
        setPedido(pedidoEncontrado);
        setPayment(pagamentoEncontrado);
        setRestanteCentavos(restante);
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
   * já executou o estorno fora do sistema e informa sua referência.
   */
  function handleConfirmarEstorno() {
    if (!referencia.trim()) { setActionError(new Error('Informe a referência do estorno executado no gateway.')); return; }
    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.refundQueue.process(params.id, 'concluido', referencia.trim(), { forceError: forceActionError })
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
    if (!detalheErro.trim()) { setActionError(new Error('Descreva a falha da execução externa.')); return; }
    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.refundQueue.process(params.id, 'erro', detalheErro.trim(), { forceError: forceActionError })
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

  async function handleReconciliar(acao: 'reopen' | 'release') {
    if (!comprovacao.trim()) { setActionError(new Error('Informe a comprovação obtida no gateway.')); return; }
    setActionPending(true); setActionError(null);
    try {
      const queue = getAdminDataClient().admin.refundQueue;
      if (acao === 'reopen') {
        await queue.reopen(params.id, comprovacao.trim());
        setReembolso((current) => current ? { ...current, status: 'pendente_admin', referencia_externa: null } : current);
      } else {
        await queue.release(params.id, comprovacao.trim());
        router.push('/reembolsos');
      }
      setComprovacao('');
    } catch (error) { setActionError(error instanceof Error ? error : new Error(String(error))); }
    finally { setActionPending(false); }
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

  const paymentPresentation = payment ? presentPaymentInspection(payment) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Executar Reembolso</h1>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="warning">{REEMBOLSO_MOTIVO_LABEL[reembolso.motivo]}</Badge>
          <Badge variant="neutral">{reembolso.status === 'estornado' ? 'Executado' : reembolso.status === 'erro' ? 'Erro na execução' : 'Aprovado, aguardando execução'}</Badge>
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
          {reembolso.pedido_id ? 'Pedido vinculado' : 'Lançamento sem pedido vinculado'}
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-tertiary">Número</dt>
          <dd className="text-text-primary">#{pedido?.numero ?? '—'}</dd>
          <dt className="text-text-tertiary">Cliente</dt>
          <dd className="text-text-primary">{pedido?.cliente_nome ?? 'Nome indisponível'}</dd>
          <dt className="text-text-tertiary">Status do pedido</dt>
          <dd className="text-text-primary">{pedido?.status ?? '—'}</dd>
          <dt className="text-text-tertiary">Forma de pagamento</dt>
          <dd className="text-text-primary">{payment?.forma.toUpperCase() ?? reembolso.forma_pagamento?.toUpperCase() ?? 'Não identificada'}</dd>
          <dt className="text-text-tertiary">Estado da tentativa</dt>
          <dd className="text-text-primary">{paymentPresentation?.estadoLabel ?? 'Sem tentativa registrada'}</dd>
          {paymentPresentation?.pendencia && (
            <>
              <dt className="text-text-tertiary">Pendência posterior</dt>
              <dd className="text-accent-warning">
                {paymentPresentation.pendencia.estadoLabel} · {paymentPresentation.pendencia.tentativaId}
              </dd>
            </>
          )}
          <dt className="text-text-tertiary">{paymentPresentation?.valorLabel ?? 'Valor previsto'}</dt>
          <dd className="text-text-primary">
            {formatReais(paymentPresentation?.valorReais ?? pedido?.total_pago_reais ?? reembolso.valor_a_estornar_reais)}
          </dd>
          <dt className="text-text-tertiary">Valor a estornar</dt>
          <dd className="text-text-primary">{formatReais(reembolso.valor_a_estornar_reais)}</dd>
          {reembolso.motivo !== 'pos_entrega' && <><dt className="text-text-tertiary">Valor ao lojista</dt>
          <dd className="text-text-primary">{formatReais(reembolso.valor_ao_lojista_reais)}</dd></>}
          <dt className="text-text-tertiary">Responsabilidade</dt>
          <dd className="text-text-primary">{reembolso.responsavel === 'lojista' ? 'Lojista' : 'Keepit'}</dd>
          <dt className="text-text-tertiary">Saldo ainda reembolsável</dt>
          <dd className="text-text-primary">{restanteCentavos === null ? '—' : formatReais(restanteCentavos / 100)}</dd>
          {reembolso.referencia_externa && <><dt className="text-text-tertiary">Referência externa</dt><dd className="text-text-primary">{reembolso.referencia_externa}</dd></>}
        </dl>
        {pedido && (
          <ul className="border-t border-border-default pt-3 text-sm text-text-secondary">
            {pedido.itens.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>{item.quantidade}× {item.nome_snapshot}</span>
                <span>{formatReais(item.subtotal_reais)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {actionError && (
        <Card className="border-accent-warning/40">
          <p className="text-sm text-accent-warning">Erro ao processar ação: {actionError.message}</p>
        </Card>
      )}

      {reembolso.status !== 'estornado' && !showErroForm && (
        <div className="flex flex-col gap-3">
          <label className="text-sm text-text-secondary">Referência do estorno já executado no gateway
            <input value={referencia} onChange={(event) => setReferencia(event.target.value)} className="mt-1 block w-full rounded-md border border-border-default bg-bg-elevated p-2 text-text-primary" />
          </label>
          <div className="flex gap-3">
          <Button onClick={handleConfirmarEstorno} disabled={actionPending}>
            {actionPending ? 'Registrando…' : 'Confirmar execução manual'}
          </Button>
          <Button variant="secondary" onClick={() => setShowErroForm(true)} disabled={actionPending}>
            Marcar como erro
          </Button>
          </div>
        </div>
      )}

      {reembolso.status !== 'estornado' && showErroForm && (
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
              Detalhe da falha externa
            </span>
            <textarea
              value={detalheErro}
              onChange={(event) => setDetalheErro(event.target.value)}
              rows={2}
              placeholder="Ex.: dados bancários incorretos, PIX manual falhou…"
              className="rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder transition-colors focus:border-accent-brand focus:outline-none"
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
      {reembolso.status === 'erro' && <Card className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">A reserva permanece ativa. Comprovação de ausência de efeito externo permite reabrir a execução ou liberar o saldo.</p>
        <textarea value={comprovacao} onChange={(event) => setComprovacao(event.target.value)} rows={2} placeholder="Comprovação obtida no gateway" className="rounded-md border border-border-default bg-bg-elevated p-2 text-text-primary" />
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => void handleReconciliar('reopen')} disabled={actionPending}>Reabrir execução</Button>
          <Button variant="danger" onClick={() => void handleReconciliar('release')} disabled={actionPending}>Liberar reserva comprovada</Button>
        </div>
      </Card>}
    </div>
  );
}
