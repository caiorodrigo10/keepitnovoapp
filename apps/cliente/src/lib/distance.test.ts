import { describe, expect, it } from 'vitest';

import { formatDistanceKm, haversineKm } from './distance';

/**
 * Story 5.1.1 (AC5). `haversineKm`/`formatDistanceKm` são funções puras
 * (sem I/O) — cobertura de: mesmo ponto (zero), par de coordenadas conhecido
 * (1 grau ~ 111,2 km na linha do equador, tolerância de arredondamento) e
 * formatação pt-BR.
 */
describe('haversineKm (Story 5.1.1, AC2/AC5)', () => {
  it('retorna 0 para o mesmo ponto', () => {
    const ponto = { lat: -23.0181, lng: -43.4521 };
    expect(haversineKm(ponto, ponto)).toBe(0);
  });

  it('calcula ~111,2 km para 1 grau de diferença de latitude na linha do equador', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 1, lng: 0 };
    expect(haversineKm(a, b)).toBeCloseTo(111.19, 0);
  });

  it('calcula ~111,2 km para 1 grau de diferença de longitude na linha do equador', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 1 };
    expect(haversineKm(a, b)).toBeCloseTo(111.19, 0);
  });

  it('é simétrica: distância(a,b) === distância(b,a)', () => {
    const a = { lat: -23.0181, lng: -43.4521 };
    const b = { lat: -23.0106, lng: -43.3078 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });

  it('calcula distância entre dois hubs reais da fixture (Barra/Recreio-RJ) dentro de uma faixa plausível', () => {
    const hubCentro = { lat: -23.0181, lng: -43.4521 };
    const hubJardins = { lat: -23.0106, lng: -43.3078 };
    const km = haversineKm(hubCentro, hubJardins);
    // Distância real ~14-15 km em linha reta entre Barra e Jardim Oceânico.
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(20);
  });
});

describe('formatDistanceKm (Story 5.1.1, AC5)', () => {
  it('formata com 1 casa decimal e vírgula pt-BR', () => {
    expect(formatDistanceKm(1.234)).toBe('1,2 km');
  });

  it('formata zero como "0,0 km"', () => {
    expect(formatDistanceKm(0)).toBe('0,0 km');
  });

  it('arredonda corretamente valores com muitas casas decimais', () => {
    expect(formatDistanceKm(3.96)).toBe('4,0 km');
  });
});
