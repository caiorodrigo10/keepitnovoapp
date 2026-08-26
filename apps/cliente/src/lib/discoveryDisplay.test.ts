import { describe, expect, it } from 'vitest';

import { businessConfig } from '@keepit/config';

import { getRatingPlaceholder, resolveTicketMinimoReais } from './discoveryDisplay';

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
