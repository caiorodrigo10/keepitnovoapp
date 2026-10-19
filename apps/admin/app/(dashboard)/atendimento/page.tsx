'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SupportCase } from '@keepit/core-data';
import { Card } from '../../../src/components/Card';
import { getAdminDataClient } from '../../../src/lib/adminClient';

export default function AtendimentoPage() {
  const [casos, setCasos] = useState<SupportCase[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    void getAdminDataClient().support.listar().then((lista) => { if (ativo) setCasos(lista); }).catch((error: unknown) => { if (ativo) setErro(error instanceof Error ? error.message : String(error)); });
    return () => { ativo = false; };
  }, []);
  return <div className="flex flex-col gap-5">
    <div><h1 className="text-2xl font-bold text-text-primary">Atendimento</h1><p className="text-sm text-text-secondary">Solicitações sem chat, com decisão registrada.</p></div>
    {erro && <Card><p className="text-accent-warning">{erro}</p></Card>}
    {!erro && casos.length === 0 && <Card><p className="text-text-secondary">Nenhuma solicitação encontrada.</p></Card>}
    {casos.map((caso) => <Card key={caso.id}>
      <Link href={`/atendimento/${caso.id}`} className="font-semibold text-text-primary hover:underline">Pedido {caso.pedidoId} · {caso.tipo}</Link>
      <p className="mt-2 text-sm text-text-secondary">{caso.motivo}</p>
      <p className="mt-1 text-xs text-text-tertiary">{caso.estado === 'aberta' ? 'Em análise' : caso.estado === 'encerrada_por_pin' ? 'Encerrada após PIN' : caso.estado === 'aprovada' ? 'Aprovada' : 'Negada'}</p>
    </Card>)}
  </div>;
}
