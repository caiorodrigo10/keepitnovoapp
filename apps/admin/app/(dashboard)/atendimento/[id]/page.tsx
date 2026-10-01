'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createSupportOperationId, remainingRefund, type Pedido, type SupportCase } from '@keepit/core-data';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { getAdminDataClient } from '../../../../src/lib/adminClient';
import { formatReais } from '../../../../src/lib/adminLabels';
import { decideSupportCase } from '../../../../src/lib/decideSupportCase';

export default function AtendimentoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [caso, setCaso] = useState<SupportCase | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [motivo, setMotivo] = useState('');
  const [valor, setValor] = useState('');
  const [responsavel, setResponsavel] = useState<'keepit' | 'lojista'>('keepit');
  const [restanteCentavos, setRestanteCentavos] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const operacaoId = useRef(createSupportOperationId());

  useEffect(() => {
    let ativo = true;
    void getAdminDataClient().support.listar().then(async (lista) => {
      const encontrado = lista.find((item) => item.id === id) ?? null;
      const pedidoAtual = encontrado ? await getAdminDataClient().order.getById(encontrado.pedidoId) : null;
      if (ativo) { setCaso(encontrado); setPedido(pedidoAtual); }
      if (ativo && pedidoAtual && encontrado?.tipo === 'pos_entrega') {
        const reembolsos = await getAdminDataClient().admin.refundQueue.list();
        const relacionados = reembolsos.filter((item) => item.pedido_id === pedidoAtual.id);
        const concluido = relacionados.filter((item) => item.status === 'estornado').reduce((sum, item) => sum + Math.round(item.valor_a_estornar_reais * 100), 0);
        const reservado = relacionados.filter((item) => item.status !== 'estornado').reduce((sum, item) => sum + Math.round(item.valor_a_estornar_reais * 100), 0);
        if (ativo) setRestanteCentavos(remainingRefund(Math.round(pedidoAtual.total_pago_reais * 100), concluido, reservado));
      }
    }).catch((error: unknown) => { if (ativo) setErro(error instanceof Error ? error.message : String(error)); });
    return () => { ativo = false; };
  }, [id]);

  async function decidir(aprovar: boolean) {
    if (!caso || !motivo.trim()) return;
    const valorNormalizado = valor.trim().replace(',', '.');
    if (aprovar && caso.tipo === 'pos_entrega' && !/^\d+(?:\.\d{1,2})?$/.test(valorNormalizado)) {
      setErro('Informe um valor em reais com até duas casas decimais.');
      return;
    }
    setOcupado(true); setErro(null);
    try {
      const result = await decideSupportCase(getAdminDataClient(), {
        casoId: caso.id, aprovar, motivo: motivo.trim(), operacaoId: operacaoId.current,
        ...(aprovar && caso.tipo === 'pos_entrega' ? { valorCentavos: Math.round(Number(valorNormalizado) * 100), responsavel } : {}),
      });
      setCaso(result.caso);
      setPedido(result.pedido);
      if (aprovar && caso.tipo === 'pos_entrega') setRestanteCentavos((current) => current === null ? null : current - Math.round(Number(valor.replace(',', '.')) * 100));
    } catch (error) { setErro(error instanceof Error ? error.message : String(error)); }
    finally { setOcupado(false); }
  }

  return <div className="flex flex-col gap-5">
    <Link href="/atendimento" className="text-sm text-text-secondary hover:underline">← Atendimento</Link>
    <h1 className="text-2xl font-bold text-text-primary">Solicitação de atendimento</h1>
    {erro && <Card><p className="text-accent-warning">{erro}</p></Card>}
    {!caso && !erro && <Card><p className="text-text-secondary">Carregando solicitação…</p></Card>}
    {caso && <Card>
      <p className="text-text-primary">{caso.tipo} · {caso.estado}</p>
      <p className="mt-2 text-sm text-text-secondary">Motivo: {caso.motivo}</p>
      {caso.motivoDecisao && <p className="mt-2 text-sm text-text-secondary">Decisão: {caso.motivoDecisao}</p>}
      {pedido && <div className="mt-4 text-sm text-text-secondary"><p>Pedido #{pedido.numero} · {pedido.status} · {formatReais(pedido.total_pago_reais)}</p><Link href={`/pedidos/${pedido.id}`} className="text-accent-brand hover:underline">Inspecionar pedido e pagamento</Link></div>}
      {caso.tipo === 'pos_entrega' && restanteCentavos !== null && <p className="mt-2 text-sm text-text-secondary">Saldo reembolsável após devoluções concluídas e reservas: {formatReais(restanteCentavos / 100)}</p>}
      {caso.estado === 'aberta' && <div className="mt-5 flex flex-col gap-3">
        <label className="text-sm text-text-secondary">Justificativa da decisão<textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} className="mt-1 min-h-24 w-full rounded-md border border-border-default bg-bg-elevated p-3 text-text-primary" /></label>
        {caso.tipo === 'pos_entrega' && <div className="flex gap-3"><label className="text-sm text-text-secondary">Valor em reais<input value={valor} onChange={(event) => setValor(event.target.value)} inputMode="decimal" className="mt-1 block rounded-md border border-border-default bg-bg-elevated p-2 text-text-primary" /></label><label className="text-sm text-text-secondary">Responsável<select value={responsavel} onChange={(event) => setResponsavel(event.target.value as 'keepit' | 'lojista')} className="mt-1 block rounded-md border border-border-default bg-bg-elevated p-2 text-text-primary"><option value="keepit">Keepit</option><option value="lojista">Lojista</option></select></label></div>}
        <div className="flex gap-3"><Button onClick={() => void decidir(true)} disabled={ocupado || !motivo.trim() || (caso.tipo === 'pos_entrega' && (!valor.trim() || !Number.isFinite(Number(valor.replace(',', '.'))) || Number(valor.replace(',', '.')) <= 0 || (restanteCentavos !== null && Math.round(Number(valor.replace(',', '.')) * 100) > restanteCentavos)))}>Aprovar</Button><Button variant="secondary" onClick={() => void decidir(false)} disabled={ocupado || !motivo.trim()}>Negar</Button></div>
      </div>}
    </Card>}
  </div>;
}
