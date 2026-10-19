'use client';

import { useSearchParams } from 'next/navigation';

import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { LinkButton } from '../../../src/components/LinkButton';
import { useLojistasOps } from '../../../src/hooks/useAdminOps';
import type { BadgeVariant } from '../../../src/components/Badge';

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
 * Lista de lojistas (todos os status) — Épico 0, Story 0.13 (Task 7/9, AC1-3).
 * Complementa a lista de "Lojistas Pendentes" da Story 0.12 (`/aprovacoes`,
 * só `em_analise`) com uma visão geral usada para acessar a ação "Suspender"
 * e a "Vista de qualidade" de cada lojista. [AUTO-DECISION] Roteamento:
 * `/lojistas` (lista geral) → `/lojistas/[id]` (detalhe com suspender +
 * link para qualidade) — decisão do @dev documentada em Completion Notes.
 */
export default function LojistasPage() {
  const searchParams = useSearchParams();
  const forceEmpty = searchParams.get('vazio') === '1';
  const forceError = searchParams.get('erro') === '1';

  const { data: lojistas, loading, error, refresh } = useLojistasOps({ forceEmpty, forceError });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Lojistas</h1>
        <p className="text-sm text-text-secondary">Todos os lojistas cadastrados, com status atual.</p>
      </div>

      {loading && <p className="text-sm text-text-tertiary">Carregando lojistas…</p>}

      {!loading && error && (
        <Card className="border-accent-warning/40">
          <p className="mb-3 text-sm text-accent-warning">Erro ao carregar lojistas: {error.message}</p>
          <Button variant="secondary" onClick={refresh}>
            Tentar novamente
          </Button>
        </Card>
      )}

      {!loading && !error && lojistas.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">Nenhum lojista cadastrado.</p>
        </Card>
      )}

      {!loading && !error && lojistas.length > 0 && (
        <div className="flex flex-col gap-3">
          {lojistas.map((lojista) => (
            <Card key={lojista.id} className="flex items-center justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-base font-semibold text-text-primary">{lojista.nome_fantasia}</span>
                  <Badge variant={STATUS_BADGE_VARIANT[lojista.status] ?? 'neutral'}>
                    {STATUS_LABEL[lojista.status] ?? lojista.status}
                  </Badge>
                </div>
                <p className="text-xs uppercase tracking-section text-text-tertiary">{lojista.categoria}</p>
              </div>
              <LinkButton href={`/lojistas/${lojista.id}`} variant="secondary" className="shrink-0">
                Ver detalhe
              </LinkButton>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
