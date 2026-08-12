'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { Badge } from '../../../src/components/Badge';
import { Card } from '../../../src/components/Card';
import { useAdminPendingStores } from '../../../src/hooks/useAdminPendingStores';

/** `criado_em` (ISO) → `dd/mm/aaaa`, mesmo formato de exibição usado no resto do Admin. */
function formatarDataCadastro(criadoEm: string): string {
  return new Date(criadoEm).toLocaleDateString('pt-BR');
}

/**
 * Lojistas pendentes — Épico 0, Story 0.12 (AC1, AC2) + Story 3.7 (AC1, AC2,
 * dados reais e colunas administrativas). Lista `admin.port.pendingStores()`
 * (`status = 'em_analise'`) — com dados reais quando `DATA_SOURCE=supabase`.
 *
 * AC1 — nota de fidelidade de interface: o texto original do épico usa o
 * caminho `/admin/lojistas/pendentes`; esta Story preserva a rota já
 * entregue (`/aprovacoes`) em vez de renomear/duplicar (política de
 * preservação do piloto, `docs/prd/07-plano-mvp-piloto.md`).
 *
 * AC2 — colunas exigidas: nome fantasia, CNPJ, categoria, telefone, data de
 * cadastro (`criado_em`) e ações (o link "Analisar cadastro" já leva a
 * `/aprovacoes/[id]`, onde aprovar/rejeitar são as Stories 3.8/3.9).
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
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-smd font-semibold uppercase tracking-section text-accent-brand">Operação</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-text-primary">Aprovações</h1>
        <p className="mt-2 text-md text-text-secondary">Revise os estabelecimentos que aguardam liberação.</p>
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
        <Card className="rounded-modal py-10 text-center">
          <p className="text-lg font-semibold text-text-primary">Fila em dia</p>
          <p className="mt-2 text-md text-text-secondary">Nenhum lojista pendente no momento.</p>
        </Card>
      )}

      {!loading && !error && pendentes.length > 0 && (
        <div className="flex flex-col gap-5">
          <Card className="rounded-modal border-accent-brand/20 bg-bg-elevated p-6 sm:p-8">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-smd font-semibold text-accent-brand">Na fila agora</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-text-primary">{pendentes.length}</p>
                <p className="mt-1 text-md text-text-secondary">lojista{pendentes.length === 1 ? '' : 's'} para analisar</p>
              </div>
              <span className="rounded-badge bg-bg-primary px-3 py-1.5 text-smd font-semibold text-text-primary">
                Ação necessária
              </span>
            </div>
          </Card>

          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-text-primary">Cadastros recentes</h2>
            <span className="text-smd text-text-tertiary">{pendentes.length} na fila</span>
          </div>

          <div className="flex flex-col gap-3">
          {pendentes.map((estabelecimento) => (
            <Card
              key={estabelecimento.id}
              className="flex flex-col gap-5 rounded-card p-6 transition-colors hover:border-border-muted sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-text-primary">{estabelecimento.nome_fantasia}</span>
                  <Badge variant="warning">Em análise</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-smd text-text-secondary">
                  <span className="capitalize">{estabelecimento.categoria}</span>
                  <span className="hidden h-1 w-1 self-center rounded-full bg-text-tertiary sm:block" aria-hidden="true" />
                  <span>CNPJ {estabelecimento.cnpj}</span>
                  <span className="hidden h-1 w-1 self-center rounded-full bg-text-tertiary sm:block" aria-hidden="true" />
                  <span>{estabelecimento.telefone}</span>
                  <span className="hidden h-1 w-1 self-center rounded-full bg-text-tertiary sm:block" aria-hidden="true" />
                  <span>Cadastrado em {formatarDataCadastro(estabelecimento.criado_em)}</span>
                </div>
              </div>
              <Link
                href={`/aprovacoes/${estabelecimento.id}`}
                className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-md bg-accent-brand px-5 text-md font-semibold text-bg-shell shadow-sm transition-colors hover:brightness-105"
              >
                Analisar cadastro
              </Link>
            </Card>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
