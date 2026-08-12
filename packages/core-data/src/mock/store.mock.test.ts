import { beforeEach, describe, expect, it } from 'vitest';

import type { StorePort } from '../ports/store.port';
import { createMockDb, type MockDb } from './db';
import { createStoreMock } from './store.mock';

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

  it('updateHorarios substitui as 7 linhas e persiste através de um novo getById (Story 4.7, AC1, AC3)', async () => {
    const novosHorarios = [
      { dia_semana: 0, aberto: false, hora_abre: null, hora_fecha: null },
      { dia_semana: 1, aberto: true, hora_abre: '10:00', hora_fecha: '20:00' },
    ];

    const atualizado = await port.updateHorarios('estab-farmacia-vida', novosHorarios, { delayMs: 1 });
    expect(atualizado).toEqual(novosHorarios);

    const relido = await port.getById('estab-farmacia-vida', { delayMs: 1 });
    expect(relido?.horarios).toEqual(novosHorarios);
  });

  it('updateHorarios rejeita quando aberto=true e hora_abre >= hora_fecha, sem gravar nada (Story 4.7, AC1)', async () => {
    const original = await port.getById('estab-farmacia-vida', { delayMs: 1 });

    await expect(
      port.updateHorarios(
        'estab-farmacia-vida',
        [{ dia_semana: 2, aberto: true, hora_abre: '18:00', hora_fecha: '08:00' }],
        { delayMs: 1 },
      ),
    ).rejects.toThrow(/hora_abre/);

    const relido = await port.getById('estab-farmacia-vida', { delayMs: 1 });
    expect(relido?.horarios).toEqual(original?.horarios);
  });

  it('updateHorarios lança para estabelecimento inexistente', async () => {
    await expect(
      port.updateHorarios('does-not-exist', [{ dia_semana: 0, aberto: false, hora_abre: null, hora_fecha: null }], {
        delayMs: 1,
      }),
    ).rejects.toThrow(/não encontrado/);
  });

  it('checkCnpjDisponivel sempre resolve true — mock não modela cnpj em Estabelecimento (Story 3.3, AC2, AC4)', async () => {
    await expect(port.checkCnpjDisponivel('11.222.333/0001-81', { delayMs: 1 })).resolves.toBe(true);
    // Mesmo CNPJ chamado de novo — ainda "disponível" (sem estado de duplicidade simulado nesta Story).
    await expect(port.checkCnpjDisponivel('11.222.333/0001-81', { delayMs: 1 })).resolves.toBe(true);
  });

  it('checkCnpjDisponivel é genuinamente assíncrono e respeita forceError (Story 3.3, AC2)', async () => {
    let resolved = false;
    const promise = port.checkCnpjDisponivel('11.222.333/0001-81', { delayMs: 0 }).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    await promise;

    await expect(
      port.checkCnpjDisponivel('11.222.333/0001-81', { forceError: true, delayMs: 1 }),
    ).rejects.toThrow();
  });
});

// `deriveLojaEstado` foi relocada para `store.port.ts` (Story 5.3, AC4,
// `[IDS] ADAPT`, fonte única mock/Supabase) — testes movidos para
// `store.port.test.ts` junto de `validarHorariosSemanais` (mesmo padrão de
// função pura compartilhada testada isoladamente de seus consumidores).
