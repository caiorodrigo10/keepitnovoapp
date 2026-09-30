'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { EstabelecimentoAdmin, Hub } from '@keepit/core-data';

import { Badge } from '../../../../src/components/Badge';
import type { BadgeVariant } from '../../../../src/components/Badge';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { getAdminDataClient } from '../../../../src/lib/adminClient';

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  em_analise: 'warning',
  ativo: 'success',
  rejeitado: 'danger',
  suspenso: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  em_analise: 'Em análise',
  ativo: 'Ativo',
  rejeitado: 'Rejeitado',
  suspenso: 'Suspenso',
};

/**
 * Detalhe do lojista + suspender — Épico 0, Story 0.13 (Task 7, AC1-3),
 * usa o detalhe administrativo para carregar também os vínculos com hubs e
 * mantém as ações de suspensão/reativação. A troca de hubs afeta somente
 * novas compras; pedidos existentes preservam o `hub_id` do snapshot.
 */
export default function DetalheLojistaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceActionError = searchParams.get('erro') === '1';

  const [lojista, setLojista] = useState<EstabelecimentoAdmin | null>(null);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubIds, setHubIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [motivoTocado, setMotivoTocado] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [hubsPending, setHubsPending] = useState(false);
  const [hubsSaved, setHubsSaved] = useState(false);
  const [hubsOperacaoId, setHubsOperacaoId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const client = getAdminDataClient();
    Promise.all([client.admin.pendingStoreDetail(params.id), client.admin.hubsCrud.list()])
      .then(([resultado, hubsResultado]) => {
        if (!cancelled) {
          setLojista(resultado);
          setHubs(hubsResultado);
          setHubIds(resultado?.hub_ids ?? []);
          setLoading(false);
        }
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

  function handleSuspender() {
    setMotivoTocado(true);
    if (motivo.trim().length === 0) {
      return;
    }
    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.suspendLojista(params.id, motivo.trim(), { forceError: forceActionError })
      .then((atualizado) => {
        setActionPending(false);
        setLojista((anterior) =>
          anterior ? { ...anterior, status: atualizado.status, motivo_suspensao: atualizado.motivo_suspensao } : anterior,
        );
        setShowForm(false);
        router.push('/lojistas');
      })
      .catch((error: unknown) => {
        setActionPending(false);
        setActionError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  /** Story 8.6 (AC4) — capacidade nova: reverte `status: 'suspenso' → 'ativo'`. */
  function handleReativar() {
    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.reactivateLojista(params.id, { forceError: forceActionError })
      .then((atualizado) => {
        setActionPending(false);
        setLojista((anterior) =>
          anterior ? { ...anterior, status: atualizado.status, motivo_suspensao: atualizado.motivo_suspensao } : anterior,
        );
      })
      .catch((error: unknown) => {
        setActionPending(false);
        setActionError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  function handleSalvarHubs() {
    setHubsPending(true);
    setHubsSaved(false);
    setActionError(null);
    getAdminDataClient()
      .admin.definirHubs(
        { estabelecimentoId: params.id, hubIds, operacaoId: hubsOperacaoId },
        { forceError: forceActionError },
      )
      .then(() => {
        setHubsPending(false);
        setHubsSaved(true);
        setHubsOperacaoId(crypto.randomUUID());
        setLojista((anterior) => (anterior ? { ...anterior, hub_ids: [...hubIds] } : anterior));
      })
      .catch((error: unknown) => {
        setHubsPending(false);
        setActionError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  if (loading) {
    return <p className="text-sm text-text-tertiary">Carregando lojista…</p>;
  }

  if (loadError || !lojista) {
    return (
      <Card className="border-accent-warning/40">
        <p className="text-sm text-accent-warning">
          {loadError ? `Erro ao carregar lojista: ${loadError.message}` : 'Lojista não encontrado.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{lojista.nome_fantasia}</h1>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant={STATUS_BADGE_VARIANT[lojista.status] ?? 'neutral'}>
            {STATUS_LABEL[lojista.status] ?? lojista.status}
          </Badge>
          <span className="text-xs uppercase tracking-section text-text-tertiary">{lojista.categoria}</span>
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Dados básicos</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-tertiary">Endereço</dt>
          <dd className="text-text-primary">{lojista.endereco}</dd>
          <dt className="text-text-tertiary">Descrição</dt>
          <dd className="text-text-primary">{lojista.descricao ?? '—'}</dd>
        </dl>
        {lojista.status === 'suspenso' && lojista.motivo_suspensao && (
          <p className="text-sm text-text-secondary">
            <span className="text-text-tertiary">Motivo da suspensão: </span>
            {lojista.motivo_suspensao}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Hubs para novas compras</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Alterações valem para compras futuras. Pedidos existentes mantêm o hub registrado no pedido.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {hubs.map((hub) => {
            const selecionado = hubIds.includes(hub.id);
            return (
              <label key={hub.id} className="flex items-start gap-2 rounded-md border border-border-default p-3 text-sm">
                <input
                  type="checkbox"
                  checked={selecionado}
                  disabled={!hub.ativo && !selecionado}
                  onChange={() => {
                    setHubsSaved(false);
                    setHubsOperacaoId(crypto.randomUUID());
                    setHubIds((atuais) =>
                      atuais.includes(hub.id) ? atuais.filter((id) => id !== hub.id) : [...atuais, hub.id],
                    );
                  }}
                />
                <span>
                  <span className="block font-semibold text-text-primary">{hub.nome}</span>
                  <span className="text-text-tertiary">{hub.ativo ? hub.endereco : 'Hub inativo — remova o vínculo'}</span>
                </span>
              </label>
            );
          })}
        </div>
        {hubIds.length === 0 && (
          <p className="text-sm text-accent-warning">Sem hubs: esta loja ficará indisponível para novas compras.</p>
        )}
        {hubsSaved && <p className="text-sm text-accent-success">Hubs atualizados.</p>}
        <div>
          <Button onClick={handleSalvarHubs} disabled={hubsPending}>
            {hubsPending ? 'Salvando…' : 'Salvar hubs'}
          </Button>
        </div>
      </Card>

      <div>
        <Link
          href={`/qualidade-lojista?estabelecimento_id=${lojista.id}`}
          className="text-sm font-semibold text-accent-brand underline underline-offset-2"
        >
          Ver vista de qualidade deste lojista
        </Link>
      </div>

      {actionError && (
        <Card className="border-accent-warning/40">
          <p className="text-sm text-accent-warning">Falha ao processar ação: {actionError.message}</p>
        </Card>
      )}

      {lojista.status === 'ativo' && !showForm && (
        <div>
          <Button variant="danger" onClick={() => setShowForm(true)}>
            Suspender lojista
          </Button>
        </div>
      )}

      {lojista.status === 'suspenso' && (
        <div>
          <Button onClick={handleReativar} disabled={actionPending}>
            {actionPending ? 'Reativando…' : 'Reativar lojista'}
          </Button>
        </div>
      )}

      {lojista.status === 'ativo' && showForm && (
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
              Motivo da suspensão (obrigatório)
            </span>
            <textarea
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              onBlur={() => setMotivoTocado(true)}
              rows={3}
              placeholder="Explique por que este lojista está sendo suspenso…"
              className="rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder transition-colors focus:border-accent-brand focus:outline-none"
            />
            {motivoTocado && motivo.trim().length === 0 && (
              <span className="text-xs text-accent-warning">Motivo é obrigatório para suspender.</span>
            )}
          </label>
          <div className="flex gap-3">
            <Button
              variant="danger"
              onClick={handleSuspender}
              disabled={actionPending || motivo.trim().length === 0}
            >
              {actionPending ? 'Suspendendo…' : 'Confirmar suspensão'}
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
