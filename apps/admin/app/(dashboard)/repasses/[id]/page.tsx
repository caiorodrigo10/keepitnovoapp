'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ComprovanteRepasse, Repasse } from '@keepit/core-data';

import { Badge } from '../../../../src/components/Badge';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { LinkButton } from '../../../../src/components/LinkButton';
import { getAdminDataClient } from '../../../../src/lib/adminClient';
import { formatReais } from '../../../../src/lib/adminLabels';

const LABEL: Record<Repasse['estado'], string> = {
  previsto: 'Previsto', pendente: 'Aguardando PIX', em_analise: 'Em análise',
  pago: 'Pago', compensado: 'Compensado', invalidado: 'Invalidado',
};
type Action = 'confirmar' | 'analise' | 'invalidar' | 'resolver';

export default function RepasseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [repasse, setRepasse] = useState<Repasse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [referencia, setReferencia] = useState('');
  const [comprovanteIdentificador, setComprovanteIdentificador] = useState('');
  const [comprovante, setComprovante] = useState<ComprovanteRepasse | null>(null);
  const [motivo, setMotivo] = useState('');
  const [evidencia, setEvidencia] = useState('');
  const operations = useRef<Partial<Record<Action, string>>>({});
  const running = useRef(false);

  useEffect(() => {
    let active = true;
    const client = getAdminDataClient();
    client.payout.listar().then(async (list) => {
      if (!active) return;
      const found = list.find((item) => item.id === id && item.estado !== 'previsto') ?? null;
      setRepasse(found);
      if (found?.estado === 'pago') {
        try {
          const proof = await client.payout.consultarComprovante(id);
          if (active) setComprovante(proof);
        } catch (cause) {
          if (active) setActionError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    }).catch((cause: unknown) => {
      if (active) setLoadError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function run(action: Action) {
    if (running.current) return;
    running.current = true;
    setPending(action); setActionError(null);
    const operationId = operations.current[action] ?? crypto.randomUUID();
    operations.current[action] = operationId;
    const client = getAdminDataClient();
    try {
      let updated: Repasse;
      if (action === 'confirmar') {
        updated = await client.payout.confirmar({ repasseId: id, referencia: referencia.trim(),
          comprovanteIdentificador: comprovanteIdentificador.trim(), operacaoId: operationId });
        setRepasse((before) => ({ ...updated, itens: before?.itens }));
        setComprovante(await client.payout.consultarComprovante(id));
      } else if (action === 'analise') {
        updated = await client.payout.marcarEmAnalise({ repasseId: id, motivo: motivo.trim(), operacaoId: operationId });
      } else if (action === 'invalidar') {
        updated = await client.payout.invalidar({ repasseId: id, motivo: motivo.trim(), operacaoId: operationId });
      } else {
        updated = await client.payout.resolverSemPix({ repasseId: id, motivo: motivo.trim(), evidencia: evidencia.trim(), operacaoId: operationId });
      }
      setRepasse((before) => ({ ...updated, itens: before?.itens }));
      operations.current[action] = undefined;
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      setPending(null);
    }
  }

  if (loading) return <p className="text-sm text-text-tertiary">Carregando repasse…</p>;
  if (loadError || !repasse) return <Card className="border-accent-warning/40"><p className="text-sm text-accent-warning">{loadError ?? 'Repasse não encontrado.'}</p></Card>;

  const actionable = repasse.estado === 'pendente' || repasse.estado === 'em_analise';
  return <div className="flex flex-col gap-6">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-text-primary">Repasse semanal</h1><p className="text-sm text-text-secondary">Semana de {repasse.semanaInicio} · Previsto para {repasse.previstoPara}</p></div>
      <Badge variant={repasse.estado === 'pago' ? 'success' : actionable ? 'warning' : 'neutral'}>{LABEL[repasse.estado]}</Badge>
    </div>
    <Card className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Snapshot para o PIX manual</h2>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-text-tertiary">Loja</dt><dd className="text-text-primary">{repasse.destinatarioNome}</dd>
        <dt className="text-text-tertiary">Responsável</dt><dd className="text-text-primary">{repasse.destinatarioResponsavel}</dd>
        <dt className="text-text-tertiary">Chave PIX</dt><dd className="break-all text-text-primary">{repasse.chavePixTipo} · {repasse.chavePix}</dd>
        <dt className="text-text-tertiary">Valor</dt><dd className="font-semibold text-text-primary">{formatReais(repasse.valorCentavos / 100)}</dd>
      </dl>
    </Card>
    {repasse.estado === 'pago' && <Card className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Registro privado do PIX</h2>
      <p className="text-sm text-text-primary">Referência: {comprovante?.referencia ?? 'Não registrada'}</p>
      <p className="text-sm text-text-secondary">Comprovante: {comprovante?.comprovanteIdentificador ?? 'Sem metadado vinculado (histórico anterior)'}</p>
    </Card>}
    <Card className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Créditos e ajustes incluídos</h2>
      {(repasse.itens ?? []).map((item) => <div key={item.lancamentoId} className="flex justify-between gap-3 text-sm text-text-secondary"><span>{item.valorCentavos < 0 ? 'Ajuste' : 'Pedido'} {item.pedidoId ?? item.lancamentoId}</span><span>{formatReais(item.valorCentavos / 100)}</span></div>)}
      {!repasse.itens?.length && <p className="text-sm text-text-tertiary">Nenhuma alocação.</p>}
    </Card>
    {actionError && <Card className="border-accent-warning/40"><p className="text-sm text-accent-warning">{actionError}</p></Card>}
    {actionable && <Card className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">Confirme apenas um PIX já executado fora do sistema. Referência e identificador do comprovante ficam no registro privado do Admin.</p>
      <input value={referencia} maxLength={256} onChange={(event) => { setReferencia(event.target.value); operations.current.confirmar = undefined; }} placeholder="Referência da transferência" aria-label="Referência do PIX"
        className="rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary" />
      <input value={comprovanteIdentificador} maxLength={512} onChange={(event) => { setComprovanteIdentificador(event.target.value); operations.current.confirmar = undefined; }}
        placeholder="Identificador do comprovante bancário/arquivo privado" aria-label="Identificador do comprovante"
        className="rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary" />
      <Button onClick={() => run('confirmar')} disabled={!!pending || !referencia.trim() || !comprovanteIdentificador.trim()}>{pending === 'confirmar' ? 'Confirmando…' : 'Confirmar PIX executado'}</Button>
    </Card>}
    {actionable && <Card className="flex flex-col gap-3">
      <label className="text-sm text-text-secondary">Motivo da conciliação</label>
      <textarea value={motivo} onChange={(event) => { setMotivo(event.target.value); operations.current.analise = undefined; operations.current.invalidar = undefined; operations.current.resolver = undefined; }} rows={2} aria-label="Motivo da conciliação"
        className="rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary" />
      {repasse.estado === 'pendente' ? <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => run('analise')} disabled={!!pending || !motivo.trim()}>Marcar PIX incerto</Button>
        <Button variant="danger" onClick={() => run('invalidar')} disabled={!!pending || !motivo.trim()}>Invalidar antes do PIX</Button>
      </div> : <>
        <p className="text-sm text-accent-warning">Libere este lote somente após conferir que nenhum PIX foi executado.</p>
        <textarea value={evidencia} onChange={(event) => { setEvidencia(event.target.value); operations.current.resolver = undefined; }} rows={2} placeholder="Evidência: referência da conciliação ou extrato bancário" aria-label="Evidência de ausência de PIX"
          className="rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary" />
        <Button variant="danger" onClick={() => run('resolver')} disabled={!!pending || !motivo.trim() || !evidencia.trim()}>Resolver sem PIX e liberar fontes</Button>
      </>}
    </Card>}
    <LinkButton href="/repasses" variant="secondary">Voltar aos repasses</LinkButton>
  </div>;
}
