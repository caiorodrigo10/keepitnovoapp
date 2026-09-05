import { describe, expect, it } from 'vitest';

import type { QaOrderProgressionDelaysMs, QaScenarioState } from '@keepit/core-data';

import {
  advanceQaClock,
  configureQaOrderProgression,
  parseQaOrderProgression,
  qaOrderProgressionValuesFrom,
} from './qaOrderProgression';

const delays: QaOrderProgressionDelaysMs = {
  aceito: 5_000,
  em_preparo: 10_000,
  saindo_hub: 15_000,
  no_hub: 20_000,
};

const normalState: QaScenarioState = {
  clockOffsetMs: 2_000,
  autoProgressOrders: false,
  orderProgressionDelaysMs: null,
  simulations: {
    orders: 'normal',
    stores: 'normal',
    hubs: 'normal',
    favorites: 'normal',
    profile: 'normal',
    search: 'normal',
  },
};

describe('parseQaOrderProgression', () => {
  it('converte os quatro tempos inteiros de segundos para milissegundos', () => {
    expect(
      parseQaOrderProgression({
        aceito: '5',
        em_preparo: '10',
        saindo_hub: '15',
        no_hub: '20',
      }),
    ).toEqual({ status: 'valid', delays });
  });

  it('rejeita campo vazio sem inventar fallback', () => {
    expect(
      parseQaOrderProgression({
        aceito: '',
        em_preparo: '10',
        saindo_hub: '15',
        no_hub: '20',
      }),
    ).toEqual({ status: 'invalid', message: 'Informe todos os tempos em segundos.' });
  });

  it.each(['-1', '1.5', 'dez'])('rejeita tempo que não seja inteiro não negativo: %s', (aceito) => {
    expect(
      parseQaOrderProgression({
        aceito,
        em_preparo: '10',
        saindo_hub: '15',
        no_hub: '20',
      }),
    ).toEqual({ status: 'invalid', message: 'Use apenas números inteiros não negativos.' });
  });

  it('aceita zero como atraso explícito', () => {
    expect(
      parseQaOrderProgression({
        aceito: '0',
        em_preparo: '0',
        saindo_hub: '0',
        no_hub: '0',
      }),
    ).toEqual({
      status: 'valid',
      delays: { aceito: 0, em_preparo: 0, saindo_hub: 0, no_hub: 0 },
    });
  });
});

describe('configureQaOrderProgression', () => {
  it('salva os atrasos e ativa o avanço preservando relógio e simulações', () => {
    expect(configureQaOrderProgression(normalState, delays, true)).toEqual({
      ...normalState,
      autoProgressOrders: true,
      orderProgressionDelaysMs: delays,
    });
  });

  it('pausa sem apagar os atrasos configurados', () => {
    const active = configureQaOrderProgression(normalState, delays, true);

    expect(configureQaOrderProgression(active, active.orderProgressionDelaysMs, false)).toEqual({
      ...active,
      autoProgressOrders: false,
    });
  });

  it('rejeita ativação sem configuração e não muta o estado atual', () => {
    expect(() => configureQaOrderProgression(normalState, null, true)).toThrow(
      'Configure os tempos antes de ativar o avanço automático.',
    );
    expect(normalState).toEqual({
      clockOffsetMs: 2_000,
      autoProgressOrders: false,
      orderProgressionDelaysMs: null,
      simulations: {
        orders: 'normal',
        stores: 'normal',
        hubs: 'normal',
        favorites: 'normal',
        profile: 'normal',
        search: 'normal',
      },
    });
  });
});

describe('advanceQaClock', () => {
  it('soma milissegundos positivos sem alterar configuração ou simulações', () => {
    const configured = configureQaOrderProgression(normalState, delays, false);

    expect(advanceQaClock(configured, 60_000)).toEqual({
      ...configured,
      clockOffsetMs: 62_000,
    });
  });

  it.each([0, -1, Number.NaN])('rejeita deslocamento não positivo: %s', (offsetMs) => {
    expect(() => advanceQaClock(normalState, offsetMs)).toThrow(
      'O avanço do relógio deve ser positivo.',
    );
  });
});

describe('qaOrderProgressionValuesFrom', () => {
  it('usa o baseline pós-reset para limpar o draft e a próxima mutação', () => {
    const previous = configureQaOrderProgression(normalState, delays, true);
    const postReset: QaScenarioState = {
      ...normalState,
      clockOffsetMs: 0,
      orderProgressionDelaysMs: null,
    };

    expect(previous.autoProgressOrders).toBe(true);
    expect(qaOrderProgressionValuesFrom(previous)).toEqual({
      aceito: '5',
      em_preparo: '10',
      saindo_hub: '15',
      no_hub: '20',
    });
    expect(qaOrderProgressionValuesFrom(postReset)).toEqual({
      aceito: '',
      em_preparo: '',
      saindo_hub: '',
      no_hub: '',
    });
    expect(advanceQaClock(postReset, 60_000)).toEqual({
      ...postReset,
      clockOffsetMs: 60_000,
    });
  });
});
