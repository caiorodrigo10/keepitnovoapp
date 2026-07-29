import { describe, expect, it } from 'vitest';

import { businessConfig } from './index';

describe('businessConfig', () => {
  it('matches the placeholders confirmed in docs/PERGUNTAS_REGRAS_NEGOCIO.md', () => {
    expect(businessConfig).toEqual({
      taxaKeepitPercent: 12,
      saqueMinimoReais: 200,
      taxaChargebackReais: 40,
      ticketMinimoReais: 20,
      timeoutAceiteMin: 10,
      pinTentativasMax: 5,
      pinBloqueioMin: 5,
      carteiraLiberacaoDias: 7,
      janelaToleranciaHubMin: 10,
      cancelamentoAntesAceitePercent: 100,
      cancelamentoAposAceitePercentCliente: 90,
      cancelamentoAposAceitePercentLojista: 10,
      clienteNaoApareceuPercentCliente: 20,
      clienteNaoApareceuPercentLojista: 80,
      lojistaNaoVeioPercent: 100,
    });
  });

  it('is exported as a readonly object (const assertion)', () => {
    // TypeScript enforces readonly at compile time via `as const`;
    // this test just guards against accidental key removal at runtime.
    expect(Object.keys(businessConfig).sort()).toEqual(
      [
        'carteiraLiberacaoDias',
        'janelaToleranciaHubMin',
        'pinBloqueioMin',
        'pinTentativasMax',
        'saqueMinimoReais',
        'taxaChargebackReais',
        'taxaKeepitPercent',
        'ticketMinimoReais',
        'timeoutAceiteMin',
        'cancelamentoAntesAceitePercent',
        'cancelamentoAposAceitePercentCliente',
        'cancelamentoAposAceitePercentLojista',
        'clienteNaoApareceuPercentCliente',
        'clienteNaoApareceuPercentLojista',
        'lojistaNaoVeioPercent',
      ].sort(),
    );
  });

  it('matches the cancellation matrix decided in Rodada 2 (Story 1.10, AC9)', () => {
    expect(businessConfig.cancelamentoAntesAceitePercent).toBe(100);
    expect(businessConfig.cancelamentoAposAceitePercentCliente).toBe(90);
    expect(businessConfig.cancelamentoAposAceitePercentLojista).toBe(10);
    expect(businessConfig.clienteNaoApareceuPercentCliente).toBe(20);
    expect(businessConfig.clienteNaoApareceuPercentLojista).toBe(80);
    expect(businessConfig.lojistaNaoVeioPercent).toBe(100);
  });
});
