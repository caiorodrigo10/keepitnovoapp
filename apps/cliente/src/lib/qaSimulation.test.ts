import type { QaScenarioState } from '@keepit/core-data';
import { describe, expect, it } from 'vitest';

import { isAnySimulationActive, isForcedLoading, simulationToAsyncCallOptions } from './qaSimulation';

const normalState: QaScenarioState = {
  clockOffsetMs: 0,
  autoProgressOrders: true,
  simulations: {
    orders: 'normal',
    stores: 'normal',
    hubs: 'normal',
    favorites: 'normal',
    profile: 'normal',
    search: 'normal',
  },
};

describe('qaSimulation', () => {
  it.each([
    ['normal', {}],
    ['loading', {}],
    ['empty', { forceEmpty: true }],
    ['error', { forceError: true }],
  ] as const)('mapeia a simulação %s para opções assíncronas', (simulation, expected) => {
    expect(simulationToAsyncCallOptions(simulation)).toEqual(expected);
  });

  it('reconhece loading como estado forçado', () => {
    expect(isForcedLoading('loading')).toBe(true);
    expect(isForcedLoading('normal')).toBe(false);
  });

  it('detecta quando qualquer domínio tem simulação ativa', () => {
    expect(isAnySimulationActive(normalState)).toBe(false);
    expect(
      isAnySimulationActive({
        ...normalState,
        simulations: { ...normalState.simulations, search: 'error' },
      }),
    ).toBe(true);
  });
});
