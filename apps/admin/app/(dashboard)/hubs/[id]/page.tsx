'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Hub } from '@keepit/core-data';

import { Card } from '../../../../src/components/Card';
import { HubForm, type HubFormValues } from '../../../../src/components/HubForm';
import { getAdminDataClient } from '../../../../src/lib/adminClient';

/**
 * Edição de hub — Épico 0, Story 0.12, Task 4. `admin.port.hubsCrud.update()`
 * (mock, sessão em memória). Campos pré-preenchidos a partir de
 * `hub.port.getById()`.
 */
export default function EditarHubPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    getAdminDataClient()
      .hub.getById(params.id)
      .then((resultado) => {
        if (!cancelled) {
          setHub(resultado);
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

  function handleSubmit(values: HubFormValues) {
    setSubmitting(true);
    setSubmitError(null);

    getAdminDataClient()
      .admin.hubsCrud.update(params.id, {
        nome: values.nome.trim(),
        endereco: values.endereco.trim(),
        lat: values.lat,
        lng: values.lng,
        ponto_referencia: values.ponto_referencia.trim() || null,
        horarios: values.horarios,
      })
      .then(() => {
        router.push('/hubs');
      })
      .catch((error: unknown) => {
        setSubmitting(false);
        setSubmitError(error instanceof Error ? error : new Error(String(error)));
      });
  }

  if (loading) {
    return <p className="text-sm text-text-tertiary">Carregando hub…</p>;
  }

  if (loadError || !hub) {
    return (
      <Card className="border-accent-warning/40">
        <p className="text-sm text-accent-warning">
          {loadError ? `Erro ao carregar hub: ${loadError.message}` : 'Hub não encontrado.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Editar Hub</h1>
        <p className="text-sm text-text-secondary">{hub.nome}</p>
      </div>

      {submitError && <p className="text-sm text-accent-warning">Erro ao salvar hub: {submitError.message}</p>}

      <HubForm initialHub={hub} submitLabel="Salvar alterações" submitting={submitting} onSubmit={handleSubmit} />
    </div>
  );
}
