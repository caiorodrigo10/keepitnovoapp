'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Estabelecimento } from '@keepit/core-data';

import { Card } from '../../../src/components/Card';
import { useLojistaOrderCounts, useLojistaQuality } from '../../../src/hooks/useAdminOps';
import { getAdminDataClient } from '../../../src/lib/adminClient';
import { ESTABELECIMENTO_FALHA_TIPO_LABEL, formatDateTime } from '../../../src/lib/adminLabels';

/** Story 8.8 (AC2) — alerta visual se >3 falhas registradas nos últimos 30 dias (limiar exato, não >=3). Janela móvel a partir de `Date.now()`, client-side (nenhum dado novo — só lógica de exibição sobre a lista já retornada por `lojistaQualityView`). */
const JANELA_ALERTA_DIAS = 30;
const LIMIAR_ALERTA_FALHAS = 3;

/**
 * Vista de qualidade do lojista — Épico 0, Story 0.13 (Task 9, AC1-3).
 * Lista `estabelecimentos_falhas` por estabelecimento selecionado.
 * [AUTO-DECISION] Acessível tanto via seletor nesta tela quanto via link a
 * partir do detalhe do lojista (`/lojistas/[id]`), que passa
 * `?estabelecimento_id=`.
 */
export default function QualidadeLojistaPage() {
  const searchParams = useSearchParams();
  const forceEmpty = searchParams.get('vazio') === '1';
  const forceError = searchParams.get('erro') === '1';
  const estabelecimentoIdParam = searchParams.get('estabelecimento_id');

  const [lojistas, setLojistas] = useState<Estabelecimento[]>([]);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(estabelecimentoIdParam);

  useEffect(() => {
    getAdminDataClient()
      .admin.listAllEstabelecimentos()
      .then((resultado) => {
        setLojistas(resultado);
        if (!selecionadoId && resultado.length > 0) {
          setSelecionadoId(resultado[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: falhas, loading, error, refresh } = useLojistaQuality(selecionadoId ?? '', {
    forceEmpty,
    forceError,
  });
  const { data: counts, loading: countsLoading } = useLojistaOrderCounts(selecionadoId ?? '');

  const lojistaSelecionado = lojistas.find((l) => l.id === selecionadoId) ?? null;

  // Story 8.8 (AC2) — >3 falhas em 30 dias (janela móvel a partir de agora), calculado
  // client-side sobre a lista já retornada por `lojistaQualityView` — nenhum dado novo.
  const limiteAlerta = new Date(Date.now() - JANELA_ALERTA_DIAS * 24 * 60 * 60 * 1000);
  const falhasRecentes = falhas.filter((f) => new Date(f.criado_em) >= limiteAlerta);
  const alertaAtivo = falhasRecentes.length > LIMIAR_ALERTA_FALHAS;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Qualidade do Lojista</h1>
        <p className="text-sm text-text-secondary">Histórico de falhas registradas por lojista.</p>
      </div>

      <label className="flex max-w-sm flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Lojista</span>
        <select
          value={selecionadoId ?? ''}
          onChange={(event) => setSelecionadoId(event.target.value)}
          className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-brand focus:outline-none"
        >
          {lojistas.map((lojista) => (
            <option key={lojista.id} value={lojista.id}>
              {lojista.nome_fantasia}
            </option>
          ))}
        </select>
      </label>

      {!countsLoading && selecionadoId && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Entregues</p>
            <p className="mt-2 text-2xl font-bold text-text-primary">{counts.entregues}</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Cancelados</p>
            <p className="mt-2 text-2xl font-bold text-text-primary">{counts.cancelados}</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Não retirado / não veio</p>
            <p className="mt-2 text-2xl font-bold text-text-primary">{counts.noShow}</p>
          </Card>
        </div>
      )}

      {alertaAtivo && (
        <Card className="border-accent-warning/40">
          <p className="text-sm font-semibold text-accent-warning">
            ⚠ Mais de {LIMIAR_ALERTA_FALHAS} falhas registradas nos últimos {JANELA_ALERTA_DIAS} dias (
            {falhasRecentes.length}) — considere avaliar a suspensão deste lojista.
          </p>
        </Card>
      )}

      {loading && <p className="text-sm text-text-tertiary">Carregando falhas…</p>}

      {!loading && error && (
        <Card className="border-accent-warning/40">
          <p className="mb-3 text-sm text-accent-warning">Erro ao carregar falhas: {error.message}</p>
          <button
            type="button"
            onClick={refresh}
            className="text-sm font-semibold text-accent-brand underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </Card>
      )}

      {!loading && !error && selecionadoId && falhas.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">
            Nenhuma falha registrada{lojistaSelecionado ? ` para ${lojistaSelecionado.nome_fantasia}` : ''}.
          </p>
        </Card>
      )}

      {!loading && !error && falhas.length > 0 && (
        <div className="flex flex-col gap-3">
          {falhas.map((falha) => (
            <Card key={falha.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">
                  {ESTABELECIMENTO_FALHA_TIPO_LABEL[falha.tipo]}
                </span>
                <span className="text-xs text-text-tertiary">{formatDateTime(falha.criado_em)}</span>
              </div>
              <p className="text-sm text-text-secondary">{falha.detalhes}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
