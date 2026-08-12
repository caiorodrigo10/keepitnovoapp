'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { EstabelecimentoAdmin } from '@keepit/core-data';

import { Badge } from '../../../../src/components/Badge';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { getAdminDataClient } from '../../../../src/lib/adminClient';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Espelha a exibição de `EstabelecimentoCadastroPort` (Story 3.5, `ChavePixTipoCadastro`). */
const CHAVE_PIX_TIPO_LABEL: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
};

/**
 * Aprovar / Rejeitar lojista — Épico 0, Story 0.12 (AC1, AC2) + Story 3.7
 * (AC1, AC3: dados reais dos 3 passos do cadastro, foto de fachada via URL
 * assinada, `dados_receita` honesto).
 *
 * Usa `admin.pendingStoreDetail` (Story 3.7), NÃO `store.getById` —
 * `EstabelecimentoAdmin` expõe campos administrativos (CNPJ, responsável,
 * telefone, chave PIX, `dados_receita`) que `StorePort.Estabelecimento`
 * (tipo de domínio da Descoberta do Cliente) nunca deveria vazar. Ver JSDoc
 * de `EstabelecimentoAdmin` em `packages/core-data/src/ports/admin.port.ts`.
 *
 * Fora de escopo desta Story (3.8/3.9): wiring real de aprovar/rejeitar —
 * `admin.approve`/`admin.reject` seguem o comportamento já existente desde o
 * Épico 0 (mock muda `status`; adapter Supabase é stub `NotImplementedError`
 * até a 3.8/3.9). `?erro=1` na URL força falha simulada da action
 * (loading/erro exercitáveis sem backend real).
 */
export default function AprovarRejeitarPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceActionError = searchParams.get('erro') === '1';

  const [estabelecimento, setEstabelecimento] = useState<EstabelecimentoAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [showRejeitarForm, setShowRejeitarForm] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [motivoTocado, setMotivoTocado] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    getAdminDataClient()
      .admin.pendingStoreDetail(params.id)
      .then((resultado) => {
        if (!cancelled) {
          setEstabelecimento(resultado);
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

  function handleAprovar() {
    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.approve(params.id, { forceError: forceActionError })
      .then(() => {
        router.push('/aprovacoes');
      })
      .catch((error: unknown) => {
        setActionPending(false);
        setActionError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  function handleRejeitar() {
    setMotivoTocado(true);
    if (motivo.trim().length === 0) {
      return;
    }

    setActionPending(true);
    setActionError(null);

    getAdminDataClient()
      .admin.reject(params.id, motivo.trim(), { forceError: forceActionError })
      .then(() => {
        router.push('/aprovacoes');
      })
      .catch((error: unknown) => {
        setActionPending(false);
        setActionError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  if (loading) {
    return <p className="text-sm text-text-tertiary">Carregando lojista…</p>;
  }

  if (loadError || !estabelecimento) {
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
        <h1 className="text-2xl font-bold text-text-primary">{estabelecimento.nome_fantasia}</h1>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="warning">Em análise</Badge>
          <span className="text-xs uppercase tracking-section text-text-tertiary">{estabelecimento.categoria}</span>
        </div>
      </div>

      {estabelecimento.foto_fachada_url_assinada && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Foto da fachada</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada de curta expiração (bucket privado), não vale a pena o loader de otimização do next/image para uma imagem descartável em minutos. */}
          <img
            src={estabelecimento.foto_fachada_url_assinada}
            alt={`Fachada de ${estabelecimento.nome_fantasia}`}
            className="max-h-64 w-full rounded-md object-cover"
          />
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Cadastro (Passo 1)</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-tertiary">CNPJ</dt>
          <dd className="text-text-primary">{estabelecimento.cnpj}</dd>
          <dt className="text-text-tertiary">Responsável</dt>
          <dd className="text-text-primary">{estabelecimento.responsavel_nome}</dd>
          <dt className="text-text-tertiary">Telefone</dt>
          <dd className="text-text-primary">{estabelecimento.telefone}</dd>
          <dt className="text-text-tertiary">Data de cadastro</dt>
          <dd className="text-text-primary">{new Date(estabelecimento.criado_em).toLocaleDateString('pt-BR')}</dd>
          <dt className="text-text-tertiary">Dados da Receita Federal</dt>
          {/* AC3: `dados_receita` é sempre `null` no piloto (Story 3.3 é SIMPLE) — exibir honestamente "não coletado", nunca um dado inventado. */}
          <dd className="text-text-primary">
            {estabelecimento.dados_receita ? JSON.stringify(estabelecimento.dados_receita) : 'não coletado'}
          </dd>
        </dl>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Dados básicos (Passo 2)</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-tertiary">Endereço</dt>
          <dd className="text-text-primary">{estabelecimento.endereco}</dd>
          <dt className="text-text-tertiary">Descrição</dt>
          <dd className="text-text-primary">{estabelecimento.descricao ?? '—'}</dd>
          <dt className="text-text-tertiary">Raio de atendimento</dt>
          <dd className="text-text-primary">
            {estabelecimento.raio_atendimento_km != null ? `${estabelecimento.raio_atendimento_km} km` : 'Não informado'}
          </dd>
          <dt className="text-text-tertiary">Tempo médio de entrega</dt>
          <dd className="text-text-primary">{estabelecimento.tempo_medio_entrega_min} min</dd>
          <dt className="text-text-tertiary">Taxa de deslocamento</dt>
          <dd className="text-text-primary">R$ {estabelecimento.taxa_deslocamento_reais.toFixed(2)}</dd>
          <dt className="text-text-tertiary">Ticket mínimo</dt>
          <dd className="text-text-primary">
            {estabelecimento.ticket_minimo_reais != null
              ? `R$ ${estabelecimento.ticket_minimo_reais.toFixed(2)}`
              : 'Padrão da plataforma'}
          </dd>
        </dl>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Chave PIX (Passo 3)</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-tertiary">Chave</dt>
          <dd className="text-text-primary">{estabelecimento.chave_pix}</dd>
          <dt className="text-text-tertiary">Tipo</dt>
          <dd className="text-text-primary">{CHAVE_PIX_TIPO_LABEL[estabelecimento.chave_pix_tipo] ?? estabelecimento.chave_pix_tipo}</dd>
        </dl>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Horário de funcionamento</h2>
        <ul className="grid grid-cols-2 gap-1 text-sm text-text-secondary sm:grid-cols-4">
          {estabelecimento.horarios.map((horario) => (
            <li key={horario.dia_semana}>
              <span className="text-text-tertiary">{DIAS_SEMANA[horario.dia_semana]}: </span>
              {horario.aberto ? `${horario.hora_abre}–${horario.hora_fecha}` : 'Fechado'}
            </li>
          ))}
        </ul>
      </Card>

      {actionError && (
        <Card className="border-accent-warning/40">
          <p className="text-sm text-accent-warning">Falha ao processar ação: {actionError.message}</p>
        </Card>
      )}

      {!showRejeitarForm && (
        <div className="flex gap-3">
          <Button onClick={handleAprovar} disabled={actionPending}>
            {actionPending ? 'Aprovando…' : 'Aprovar'}
          </Button>
          <Button variant="danger" onClick={() => setShowRejeitarForm(true)} disabled={actionPending}>
            Rejeitar
          </Button>
        </div>
      )}

      {showRejeitarForm && (
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
              Motivo da rejeição (obrigatório)
            </span>
            <textarea
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              onBlur={() => setMotivoTocado(true)}
              rows={3}
              placeholder="Explique por que este cadastro está sendo rejeitado…"
              className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
            />
            {motivoTocado && motivo.trim().length === 0 && (
              <span className="text-xs text-accent-warning">Motivo é obrigatório para rejeitar.</span>
            )}
          </label>
          <div className="flex gap-3">
            <Button
              variant="danger"
              onClick={handleRejeitar}
              disabled={actionPending || motivo.trim().length === 0}
            >
              {actionPending ? 'Rejeitando…' : 'Confirmar rejeição'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowRejeitarForm(false);
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
