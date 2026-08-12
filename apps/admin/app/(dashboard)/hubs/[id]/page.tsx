'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Hub } from '@keepit/core-data';

import { Card } from '../../../../src/components/Card';
import { HubForm, type HubFormValues } from '../../../../src/components/HubForm';
import { getAdminDataClient } from '../../../../src/lib/adminClient';
import { uploadFotoHub } from '../../../../src/lib/hubFoto';

/**
 * Edição de hub — Épico 0, Story 0.12, Task 4; upload de foto real (Story
 * 4.1, AC2, AC6). `admin.port.hubsCrud.update()`. Campos pré-preenchidos a
 * partir de `admin.hubsCrud.getById()`.
 *
 * [AUTO-DECISION] Story 4.1 (AC1, AC4) — `admin.hubsCrud.getById`, NÃO
 * `hub.getById` → (reason: `hub.getById` é a leitura pública de Descoberta,
 * Épico 5; manter a origem simétrica com `useAdminHubs` — que já usa
 * `admin.hubsCrud.list`, mesmo racional de escopo administrativo dedicado —
 * evita duas fontes de leitura administrativa divergentes para a mesma
 * tela. Ver JSDoc de `AdminPort.hubsCrud.list`).
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
      .admin.hubsCrud.getById(params.id)
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

  async function handleSubmit(values: HubFormValues) {
    setSubmitting(true);
    setSubmitError(null);

    try {
      // AC2 — só reenvia `foto_url` se o admin escolheu um NOVO arquivo;
      // sem seleção, o patch omite o campo e `hubsCrud.update` preserva a
      // foto já cadastrada (UPDATE parcial, só toca colunas presentes).
      const fotoUrl = values.fotoFile ? await uploadFotoHub(values.fotoFile) : undefined;

      await getAdminDataClient().admin.hubsCrud.update(params.id, {
        nome: values.nome.trim(),
        endereco: values.endereco.trim(),
        lat: values.lat,
        lng: values.lng,
        ponto_referencia: values.ponto_referencia.trim() || null,
        ...(fotoUrl !== undefined ? { foto_url: fotoUrl } : {}),
        horarios: values.horarios,
      });
      router.push('/hubs');
    } catch (error: unknown) {
      setSubmitting(false);
      setSubmitError(error instanceof Error ? error : new Error(String(error)));
    }
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
