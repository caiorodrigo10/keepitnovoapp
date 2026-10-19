import { describe, expect, it } from 'vitest';

import { businessConfig } from '@keepit/config';

import {
  getRatingPlaceholder,
  resolveFavoriteEntities,
  resolveTicketMinimoReais,
  selectFavoriteEntities,
  shouldResolveFavoriteSnapshot,
} from './discoveryDisplay';

describe('favorite discovery projections (Story 12.11)', () => {
  it('seleciona somente os IDs do contexto sem descartar entidades indisponíveis', () => {
    const entities = [
      { id: 'loja-aberta', state: 'aberta' },
      { id: 'loja-pausada', state: 'pausada' },
      { id: 'loja-estatica-antiga', state: 'aberta' },
    ];

    expect(
      selectFavoriteEntities(entities, new Set(['loja-pausada'])),
    ).toEqual([{ id: 'loja-pausada', state: 'pausada' }]);
  });

  it('resolve os IDs na ordem persistida, preserva inativos e omite apenas alvos ausentes', async () => {
    const entities = new Map([
      ['hub-ativo', { id: 'hub-ativo', ativo: true }],
      ['hub-inativo', { id: 'hub-inativo', ativo: false }],
    ]);

    await expect(
      resolveFavoriteEntities(
        new Set(['hub-inativo', 'hub-ausente', 'hub-ativo']),
        async (id) => entities.get(id) ?? null,
      ),
    ).resolves.toEqual([
      { id: 'hub-inativo', ativo: false },
      { id: 'hub-ativo', ativo: true },
    ]);
  });

  it('rejeita a resolução inteira quando uma leitura falha para a UI manter o último snapshot', async () => {
    await expect(
      resolveFavoriteEntities(new Set(['hub-a']), async () => {
        throw new Error('falha de leitura');
      }),
    ).rejects.toThrow('falha de leitura');
  });

  it('aplica a visibilidade pública somente depois que todas as leituras resolvem', async () => {
    const entities = new Map([
      ['loja-visivel', { id: 'loja-visivel', deletedAt: null }],
      ['loja-excluida', { id: 'loja-excluida', deletedAt: '2026-09-05T00:00:00Z' }],
    ]);

    await expect(
      resolveFavoriteEntities(
        new Set(entities.keys()),
        async (id) => entities.get(id) ?? null,
        (entity) => entity.deletedAt === null,
      ),
    ).resolves.toEqual([{ id: 'loja-visivel', deletedAt: null }]);
  });

  it('não substitui o snapshot após refresh falho, mas reconcilia IDs alterados por rollback', () => {
    expect(shouldResolveFavoriteSnapshot(true, false, true)).toBe(false);
    expect(shouldResolveFavoriteSnapshot(false, true, false)).toBe(false);
    expect(shouldResolveFavoriteSnapshot(false, true, true)).toBe(true);
    expect(shouldResolveFavoriteSnapshot(false, false, false)).toBe(true);
  });
});

/**
 * Story 5.4 (AC4) — "Pedido mínimo: R$ X". Único ponto testável em `.test.ts`
 * puro desta Story: `Loja.tsx` (`.tsx`) não tem harness de teste de
 * componente configurado neste app (`vitest.config.ts#include` só cobre
 * `src/**\/*.test.ts`, nenhuma lib de testing-library para React Native no
 * monorepo) — ver Dev Agent Record da Story 5.4 para o registro explícito
 * dessa lacuna de infraestrutura, não presumida como "fora de escopo
 * silenciosamente".
 */
describe('resolveTicketMinimoReais (Story 5.4, AC4)', () => {
  it('usa ticket_minimo_reais da loja quando não é null', () => {
    expect(resolveTicketMinimoReais({ ticket_minimo_reais: 30 })).toBe(30);
  });

  it('usa businessConfig.ticketMinimoReais (COALESCE) quando ticket_minimo_reais é null', () => {
    expect(resolveTicketMinimoReais({ ticket_minimo_reais: null })).toBe(businessConfig.ticketMinimoReais);
  });

  it('trata 0 como valor explícito (não confunde com null/falsy)', () => {
    expect(resolveTicketMinimoReais({ ticket_minimo_reais: 0 })).toBe(0);
  });
});

/**
 * Story 5.8 (confirmation-only, UI_ONLY) — trava a natureza decorativa de
 * `getRatingPlaceholder`: função síncrona e pura (sem `Promise`, sem porta/
 * adapter, sem leitura de `db.estabelecimentos`), valores FIXOS por loja
 * (decisão já tomada na Story 0.5, preservada — NÃO uniformizar para `4.5`
 * literal). Nenhum sistema de avaliação/agregação é criado por este teste.
 */
describe('getRatingPlaceholder (Story 5.8, AC1/AC3 — confirmação)', () => {
  it('é uma função síncrona (não retorna Promise) — sem chamada a backend/porta', () => {
    const resultado = getRatingPlaceholder('estab-farmacia-vida');
    expect(resultado).not.toBeInstanceOf(Promise);
    expect(typeof resultado).toBe('number');
  });

  it('mantém valores FIXOS por loja congelados do protótipo (não uniformiza para 4.5)', () => {
    expect(getRatingPlaceholder('estab-farmacia-vida')).toBe(4.8);
    expect(getRatingPlaceholder('estab-bem-vestir')).toBe(4.6);
    expect(getRatingPlaceholder('estab-conveniencia-24h')).toBe(4.5);
  });

  it('usa fallback 4.5 para lojas fora do mapa (sem inventar valor novo)', () => {
    expect(getRatingPlaceholder('estab-inexistente-em-teste')).toBe(4.5);
  });
});
