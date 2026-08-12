'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { HubForm, type HubFormValues } from '../../../../src/components/HubForm';
import { getAdminDataClient } from '../../../../src/lib/adminClient';
import { uploadFotoHub } from '../../../../src/lib/hubFoto';

/**
 * Cadastro de hub — Épico 0, Story 0.12, Task 4; upload de foto real
 * (Story 4.1, AC2, AC6). `admin.port.hubsCrud.create()`.
 */
export default function NovoHubPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function handleSubmit(values: HubFormValues) {
    setSubmitting(true);
    setError(null);

    try {
      // AC2 — foto é opcional; só faz upload se o admin selecionou um
      // arquivo (já validado por `HubForm`/`validarFotoHub` antes de chegar
      // aqui). Falha de upload interrompe o fluxo ANTES de criar o hub —
      // nunca um sucesso parcial (hub criado sem a foto que o admin achou
      // que tinha enviado).
      const fotoUrl = values.fotoFile ? await uploadFotoHub(values.fotoFile) : null;

      await getAdminDataClient().admin.hubsCrud.create({
        nome: values.nome.trim(),
        endereco: values.endereco.trim(),
        lat: values.lat,
        lng: values.lng,
        ponto_referencia: values.ponto_referencia.trim() || null,
        foto_url: fotoUrl,
        horarios: values.horarios,
      });
      router.push('/hubs');
    } catch (err: unknown) {
      setSubmitting(false);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Novo Hub</h1>
        <p className="text-sm text-text-secondary">Cadastre um novo ponto de retirada.</p>
      </div>

      {error && <p className="text-sm text-accent-warning">Erro ao criar hub: {error.message}</p>}

      <HubForm submitLabel="Criar hub" submitting={submitting} onSubmit={handleSubmit} />
    </div>
  );
}
