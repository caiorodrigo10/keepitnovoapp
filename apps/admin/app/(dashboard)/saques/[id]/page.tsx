'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Estabelecimento, Saque } from '@keepit/core-data';

import { Badge } from '../../../../src/components/Badge';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { getAdminDataClient } from '../../../../src/lib/adminClient';
import { formatReais, SAQUE_STATUS_LABEL } from '../../../../src/lib/adminLabels';

/**
 * Marcar saque executado — Story 8.9 (AC3, AC4, AC5). Mesmo padrão manual
 * auditável de `/reembolsos/[id]` (Story 8.2): "Marcar executado" confirma
 * que o admin já fez o PIX manual fora do sistema (`resultado: 'concluido'`,
 * SEM chamada Asaas real); "Marcar erro" registra a falha auditada
 * (`resultado: 'erro'`, com detalhe opcional). Log de auditoria nativo do
 * ledger (`ator_admin_id`/`concluido_em`) — nenhuma tabela de log separada.
 */
export default function ProcessarSaquePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceActionError = searchParams.get('erro') === '1';

  const [saque, setSaque] = useState<Saque | null>(null);
  const [lojista, setLojista] = useState<Estabelecimento | null>(null);
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
    Promise.all([client.admin.payoutQueue.list(), client.admin.listAllEstabelecimentos()])
      .then(([saques, lojas]) => {
        if (cancelled) return;
        const encontrado = saques.find((s) => s.id === params.id) ?? null;
        setSaque(encontrado);
        if (encontrado) {
          setLojista(lojas.find((l) => l.id === encontrado.estabelecimento_id) ?? null);
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

  function handleMarcarExecutado() {
    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.payoutQueue.process(params.id, 'concluido', undefined, { forceError: forceActionError })
      .then((atualizado) => {
        setActionPending(false);
        setSaque(atualizado);
        router.push('/saques');
      })
      .catch((error: unknown) => {
        setActionPending(false);
        setActionError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  function handleMarcarErro() {
    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.payoutQueue.process(params.id, 'erro', detalheErro.trim() || undefined, { forceError: forceActionError })
      .then((atualizado) => {
        setActionPending(false);
        setSaque(atualizado);
        setShowErroForm(false);
      })
      .catch((error: unknown) => {
        setActionPending(false);
        setActionError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  if (loading) {
    return <p className="text-sm text-text-tertiary">Carregando saque…</p>;
  }

  if (loadError || !saque) {
    return (
      <Card className="border-accent-warning/40">
        <p className="text-sm text-accent-warning">
          {loadError ? `Erro ao carregar saque: ${loadError.message}` : 'Saque não encontrado.'}
        </p>
      </Card>
    );
  }

  const podeProcessar = saque.status !== 'concluido' && saque.status !== 'erro';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Marcar Saque Executado</h1>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="neutral">{SAQUE_STATUS_LABEL[saque.status]}</Badge>
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Lojista</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-tertiary">Nome</dt>
          <dd className="text-text-primary">{lojista?.nome_fantasia ?? saque.estabelecimento_id}</dd>
          <dt className="text-text-tertiary">Valor a repassar</dt>
          <dd className="text-text-primary">{formatReais(saque.valor_reais)}</dd>
        </dl>
      </Card>

      {actionError && (
        <Card className="border-accent-warning/40">
          <p className="text-sm text-accent-warning">Erro ao processar ação: {actionError.message}</p>
        </Card>
      )}

      {podeProcessar && !showErroForm && (
        <div className="flex gap-3">
          <Button onClick={handleMarcarExecutado} disabled={actionPending}>
            {actionPending ? 'Processando…' : 'Marcar executado'}
          </Button>
          <Button variant="secondary" onClick={() => setShowErroForm(true)} disabled={actionPending}>
            Marcar como erro
          </Button>
        </div>
      )}

      {podeProcessar && showErroForm && (
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
