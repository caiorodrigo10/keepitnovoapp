import type { AsyncCallOptions, QaScenarioState, QaSimulationState } from '@keepit/core-data';

export function simulationToAsyncCallOptions(simulation: QaSimulationState): AsyncCallOptions {
  if (simulation === 'empty') {
    return { forceEmpty: true };
  }
  if (simulation === 'error') {
    return { forceError: true };
  }
  return {};
}

export function isForcedLoading(simulation: QaSimulationState): boolean {
  return simulation === 'loading';
}

export function isAnySimulationActive(state: QaScenarioState): boolean {
  return Object.values(state.simulations).some((simulation) => simulation !== 'normal');
}
