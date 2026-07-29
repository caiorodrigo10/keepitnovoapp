'use client';

import { useState } from 'react';

import type { Hub, HubHorario } from '@keepit/core-data';

import { Button } from './Button';
import { Card } from './Card';

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export interface HubFormValues {
  nome: string;
  endereco: string;
  lat: number;
  lng: number;
  ponto_referencia: string;
  horarios: HubHorario[];
}

function horarioPadrao(): HubHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: true,
    hora_abre: '08:00',
    hora_fecha: '20:00',
  }));
}

function toFormValues(hub?: Hub | null): HubFormValues {
  if (!hub) {
    return { nome: '', endereco: '', lat: 0, lng: 0, ponto_referencia: '', horarios: horarioPadrao() };
  }
  return {
    nome: hub.nome,
    endereco: hub.endereco,
    lat: hub.lat,
    lng: hub.lng,
    ponto_referencia: hub.ponto_referencia ?? '',
    horarios: hub.horarios,
  };
}

/**
 * Formulário de hub (nome, endereço, lat/lng, ponto de referência, horário
 * 7 dias) — Épico 0, Story 0.12, Task 4. [IDS] REUSE: compartilhado entre
 * `/hubs/novo` (create) e `/hubs/[id]` (update), evita duplicar os ~7 campos
 * de horário duas vezes.
 */
export function HubForm({
  initialHub,
  submitLabel,
  submitting,
  onSubmit,
}: {
  initialHub?: Hub | null;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (values: HubFormValues) => void;
}) {
  const [values, setValues] = useState<HubFormValues>(() => toFormValues(initialHub));
  const [tocado, setTocado] = useState(false);

  const nomeValido = values.nome.trim().length > 0;
  const enderecoValido = values.endereco.trim().length > 0;
  const formValido = nomeValido && enderecoValido;

  function updateHorario(dia_semana: number, patch: Partial<HubHorario>) {
    setValues((previous) => ({
      ...previous,
      horarios: previous.horarios.map((horario) =>
        horario.dia_semana === dia_semana ? { ...horario, ...patch } : horario,
      ),
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTocado(true);
    if (!formValido) {
      return;
    }
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Dados do hub</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">Nome</span>
          <input
            value={values.nome}
            onChange={(event) => setValues((previous) => ({ ...previous, nome: event.target.value }))}
            placeholder="Hub Centro"
            className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
          />
          {tocado && !nomeValido && <span className="text-xs text-accent-warning">Nome é obrigatório.</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">Endereço</span>
          <input
            value={values.endereco}
            onChange={(event) => setValues((previous) => ({ ...previous, endereco: event.target.value }))}
            placeholder="Rua das Flores, 123 — Centro"
            className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
          />
          {tocado && !enderecoValido && <span className="text-xs text-accent-warning">Endereço é obrigatório.</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">Ponto de referência (opcional)</span>
          <input
            value={values.ponto_referencia}
            onChange={(event) => setValues((previous) => ({ ...previous, ponto_referencia: event.target.value }))}
            placeholder="Em frente à praça central"
            className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
          />
        </label>
        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm text-text-secondary">Latitude (opcional)</span>
            <input
              type="number"
              step="any"
              value={values.lat}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, lat: Number(event.target.value) || 0 }))
              }
              className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-brand focus:outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm text-text-secondary">Longitude (opcional)</span>
            <input
              type="number"
              step="any"
              value={values.lng}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, lng: Number(event.target.value) || 0 }))
              }
              className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-brand focus:outline-none"
            />
          </label>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
          Horário de funcionamento
        </h2>
        <div className="flex flex-col gap-2">
          {values.horarios.map((horario) => (
            <div key={horario.dia_semana} className="flex items-center gap-3 text-sm">
              <label className="flex w-32 items-center gap-2 text-text-secondary">
                <input
                  type="checkbox"
                  checked={horario.aberto}
                  onChange={(event) =>
                    updateHorario(horario.dia_semana, {
                      aberto: event.target.checked,
                      hora_abre: event.target.checked ? (horario.hora_abre ?? '08:00') : null,
                      hora_fecha: event.target.checked ? (horario.hora_fecha ?? '20:00') : null,
                    })
                  }
                />
                {DIAS_SEMANA[horario.dia_semana]}
              </label>
              {horario.aberto ? (
                <>
                  <input
                    type="time"
                    value={horario.hora_abre ?? ''}
                    onChange={(event) => updateHorario(horario.dia_semana, { hora_abre: event.target.value })}
                    className="rounded-sm border border-border-default bg-bg-elevated px-2 py-1 text-text-primary"
                  />
                  <span className="text-text-tertiary">até</span>
                  <input
                    type="time"
                    value={horario.hora_fecha ?? ''}
                    onChange={(event) => updateHorario(horario.dia_semana, { hora_fecha: event.target.value })}
                    className="rounded-sm border border-border-default bg-bg-elevated px-2 py-1 text-text-primary"
                  />
                </>
              ) : (
                <span className="text-text-tertiary">Fechado</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Salvando…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
