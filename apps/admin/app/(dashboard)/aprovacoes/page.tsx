'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { Badge } from '../../../src/components/Badge';
import { Card } from '../../../src/components/Card';
import { useAdminPendingStores } from '../../../src/hooks/useAdminPendingStores';

/**
 * Lojistas pendentes — Épico 0, Story 0.12 (AC1, AC2). Lista
 * `admin.port.pendingStores()` (`status = 'em_analise'`).
 *
 * Estados loading/vazio/erro exercitáveis via query string, sem precisar de
 * backend real (AC4 da Story 0.2): `?vazio=1` força lista vazia, `?erro=1`
 * força falha simulada — usado por @qa para validar os 3 estados no browser.
 */
export default function AprovacoesPage() {
  const searchParams = useSearchParams();
  const forceEmpty = searchParams.get('vazio') === '1';
  const forceError = searchParams.get('erro') === '1';

  const { data: pendentes, loading, error, refresh } = useAdminPendingStores({ forceEmpty, forceError });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Lojistas Pendentes</h1>
        <p className="text-sm text-text-secondary">Estabelecimentos aguardando análise de cadastro.</p>
      </div>

      {loading && <p className="text-sm text-text-tertiary">Carregando lojistas pendentes…</p>}

      {!loading && error && (
        <Card className="border-accent-warning/40">
          <p className="mb-3 text-sm text-accent-warning">Erro ao carregar lojistas pendentes: {error.message}</p>
          <button
            type="button"
            onClick={refresh}
            className="text-sm font-semibold text-accent-brand underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </Card>
      )}

      {!loading && !error && pendentes.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">Nenhum lojista pendente no momento.</p>
        </Card>
      )}

      {!loading && !error && pendentes.length > 0 && (
        <div className="flex flex-col gap-3">
          {pendentes.map((estabelecimento) => (
            <Card key={estabelecimento.id} className="flex items-center justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-base font-semibold text-text-primary">{estabelecimento.nome_fantasia}</span>
                  <Badge variant="warning">Em análise</Badge>
                </div>
                <p className="text-xs uppercase tracking-section text-text-tertiary">{estabelecimento.categoria}</p>
                <p className="mt-1 text-sm text-text-secondary">{estabelecimento.endereco}</p>
              </div>
              <Link
                href={`/aprovacoes/${estabelecimento.id}`}
                className="shrink-0 rounded-sm bg-accent-brand px-4 py-2 text-sm font-semibold text-bg-shell hover:opacity-90"
              >
                Analisar
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
