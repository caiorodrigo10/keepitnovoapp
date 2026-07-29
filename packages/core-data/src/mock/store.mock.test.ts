import { beforeEach, describe, expect, it } from 'vitest';

import type { StorePort } from '../ports/store.port';
import { createMockDb, type MockDb } from './db';
import { createStoreMock, deriveLojaEstado } from './store.mock';

describe('store.mock (contract)', () => {
  let db: MockDb;
  let port: StorePort;

  beforeEach(() => {
    db = createMockDb();
    port = createStoreMock(db);
  });

  it('listByHub resolves with an array of Estabelecimento (status ativo)', async () => {
    const lojas = await port.listByHub('hub-centro', { delayMs: 1 });
    expect(lojas.length).toBeGreaterThan(0);
    expect(lojas.every((loja) => loja.status === 'ativo')).toBe(true);
  });

  it('getCatalog resolves with only active products for the given loja', async () => {
    const catalogo = await port.getCatalog('estab-farmacia-vida', { delayMs: 1 });
    expect(catalogo.length).toBeGreaterThan(0);
    expect(catalogo.every((p) => p.estabelecimento_id === 'estab-farmacia-vida')).toBe(true);
  });

  it('getById returns null for unknown id', async () => {
    await expect(port.getById('does-not-exist', { delayMs: 1 })).resolves.toBeNull();
  });

  it('getState returns "pausada" for a manually-paused loja regardless of horário', async () => {
    const estado = await port.getState('estab-bem-vestir', { delayMs: 1 });
    expect(estado).toBe('pausada');
  });

  it('is genuinely asynchronous — does not resolve on the same tick', () => {
    let resolved = false;
    const promise = port.listByHub('hub-centro', { delayMs: 0 }).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    return promise;
  });

  it('forceError rejects the Promise', async () => {
    await expect(port.listByHub('hub-centro', { forceError: true, delayMs: 1 })).rejects.toThrow();
  });

  it('forceEmpty resolves with an empty array', async () => {
    await expect(port.listByHub('hub-centro', { forceEmpty: true, delayMs: 1 })).resolves.toEqual([]);
  });

  it('setPausadoManualmente persists across a new getById (Story 1.10, Task 6)', async () => {
    const atualizado = await port.setPausadoManualmente('estab-farmacia-vida', true, { delayMs: 1 });
    expect(atualizado.pausado_manualmente).toBe(true);

    const relido = await port.getById('estab-farmacia-vida', { delayMs: 1 });
    expect(relido?.pausado_manualmente).toBe(true);
  });
});

describe('deriveLojaEstado', () => {
  const baseLoja = {
    id: 'x',
    nome_fantasia: 'x',
    categoria: 'x',
    descricao: null,
    foto_fachada_url: null,
    endereco: 'x',
    lat: 0,
    lng: 0,
    raio_atendimento_km: 1,
    tempo_medio_entrega_min: 10,
    taxa_deslocamento_reais: 0,
    ticket_minimo_reais: null,
    status: 'ativo' as const,
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: [{ dia_semana: 3, aberto: true, hora_abre: '09:00', hora_fecha: '18:00' }],
  };

  it('returns "pausada" when pausado_manualmente = true, even inside horário', () => {
    const wednesdayNoon = new Date('2026-07-29T12:00:00'); // wednesday
    const estado = deriveLojaEstado({ ...baseLoja, pausado_manualmente: true }, wednesdayNoon);
    expect(estado).toBe('pausada');
  });

  it('returns "aberta" within the configured horário', () => {
    const wednesdayNoon = new Date('2026-07-29T12:00:00');
    expect(deriveLojaEstado(baseLoja, wednesdayNoon)).toBe('aberta');
  });

  it('returns "fechada" outside the configured horário', () => {
    const wednesdayNight = new Date('2026-07-29T22:00:00');
    expect(deriveLojaEstado(baseLoja, wednesdayNight)).toBe('fechada');
  });

  it('returns "fechada" on a day without a horário entry', () => {
    const thursdayNoon = new Date('2026-07-30T12:00:00'); // no horário seeded for this day
    expect(deriveLojaEstado(baseLoja, thursdayNoon)).toBe('fechada');
  });
});
