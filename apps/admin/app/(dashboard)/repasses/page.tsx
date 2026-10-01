'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Estabelecimento, Repasse } from '@keepit/core-data';

import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { LinkButton } from '../../../src/components/LinkButton';
import { useRepasses } from '../../../src/hooks/useAdminOps';
import { getAdminDataClient } from '../../../src/lib/adminClient';
import { formatReais } from '../../../src/lib/adminLabels';
import { previousClosedWeek } from '../../../src/lib/payoutCalendar';

const LABEL: Record<Repasse['estado'], string> = {
  previsto: 'Previsto', pendente: 'Aguardando PIX', em_analise: 'Em análise',
  pago: 'Pago', compensado: 'Compensado', invalidado: 'Invalidado',
};

export default function RepassesPage() {
  const params = useSearchParams();
  const { data: repasses, loading, error, refresh } = useRepasses({
    forceEmpty: params.get('vazio') === '1', forceError: params.get('erro') === '1',
  });
  const [lojas, setLojas] = useState<Record<string, Estabelecimento>>({});
  const [week, setWeek] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const operation = useRef<string | null>(null);

  useEffect(() => {
    setWeek(previousClosedWeek(new Date()));
    let active = true;
    getAdminDataClient().admin.listAllEstabelecimentos().then((list) => {
      if (active) setLojas(Object.fromEntries(list.map((loja) => [loja.id, loja])));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function preparar() {
    if (!week) return;
    setPreparing(true); setActionError(null);
    operation.current ??= crypto.randomUUID();
    try {
      await getAdminDataClient().payout.preparar({ semanaInicio: week, operacaoId: operation.current });
      operation.current = null;
      refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreparing(false);
    }
  }

  return <div className="flex flex-col gap-6">
    <div>
      <h1 className="text-2xl font-bold text-text-primary">Repasses semanais</h1>
      <p className="text-sm text-text-secondary">Créditos por PIN e ajustes confirmados. O PIX é executado fora do sistema e registrado por lote.</p>
    </div>
    <Card className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        Semana encerrada em
        <input type="date" value={week} onChange={(event) => { setWeek(event.target.value); operation.current = null; }}
          className="rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-text-primary" />
      </label>
      <Button onClick={preparar} disabled={!week || preparing}>{preparing ? 'Preparando…' : 'Preparar lotes'}</Button>
      <span className="text-xs text-text-tertiary">A semana começa na segunda-feira de São Paulo; vencimento na sexta seguinte.</span>
    </Card>
    {actionError && <Card className="border-accent-warning/40"><p className="text-sm text-accent-warning">{actionError}</p></Card>}
    {loading && <p className="text-sm text-text-tertiary">Carregando repasses…</p>}
    {!loading && error && <Card className="border-accent-warning/40"><p className="mb-3 text-sm text-accent-warning">{error.message}</p><Button variant="secondary" onClick={refresh}>Tentar novamente</Button></Card>}
    {!loading && !error && repasses.length === 0 && <Card><p className="text-sm text-text-secondary">Nenhum repasse ou previsão disponível.</p></Card>}
    {!loading && !error && repasses.map((repasse) => <Card key={repasse.id} className="flex items-center justify-between gap-4">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="font-semibold text-text-primary">{lojas[repasse.estabelecimentoId]?.nome_fantasia ?? repasse.destinatarioNome ?? repasse.estabelecimentoId}</span>
          <Badge variant={repasse.estado === 'pago' ? 'success' : repasse.estado === 'pendente' || repasse.estado === 'em_analise' ? 'warning' : 'neutral'}>{LABEL[repasse.estado]}</Badge>
        </div>
        <p className="text-sm text-text-secondary">Semana de {repasse.semanaInicio} · Previsto para {repasse.previstoPara} · {formatReais(repasse.valorCentavos / 100)}</p>
      </div>
      {repasse.estado !== 'previsto' && <LinkButton href={`/repasses/${repasse.id}`}>Detalhes</LinkButton>}
    </Card>)}
  </div>;
}
