import type { QaOrderProgressionDelaysMs, QaScenarioState } from '@keepit/core-data';

export type QaOrderProgressionValues = Record<keyof QaOrderProgressionDelaysMs, string>;

export type QaOrderProgressionParseResult =
  | { status: 'valid'; delays: QaOrderProgressionDelaysMs }
  | { status: 'invalid'; message: string };

const ORDER_PROGRESSION_KEYS: ReadonlyArray<keyof QaOrderProgressionDelaysMs> = [
  'aceito',
  'em_preparo',
  'saindo_hub',
  'no_hub',
];

export function parseQaOrderProgression(
  values: QaOrderProgressionValues,
): QaOrderProgressionParseResult {
  const normalized = ORDER_PROGRESSION_KEYS.map((key) => values[key].trim());
  if (normalized.some((value) => value.length === 0)) {
    return { status: 'invalid', message: 'Informe todos os tempos em segundos.' };
  }

  const seconds = normalized.map(Number);
  if (
    normalized.some((value) => !/^\d+$/.test(value)) ||
    seconds.some((value) => !Number.isSafeInteger(value) || value > Number.MAX_SAFE_INTEGER / 1_000)
  ) {
    return { status: 'invalid', message: 'Use apenas números inteiros não negativos.' };
  }

  return {
    status: 'valid',
    delays: {
      aceito: seconds[0] * 1_000,
      em_preparo: seconds[1] * 1_000,
      saindo_hub: seconds[2] * 1_000,
      no_hub: seconds[3] * 1_000,
    },
  };
}

export function configureQaOrderProgression(
  state: QaScenarioState,
  delays: QaOrderProgressionDelaysMs | null,
  enabled: boolean,
): QaScenarioState {
  if (enabled && !delays) {
    throw new Error('Configure os tempos antes de ativar o avanço automático.');
  }

  return {
    ...state,
    autoProgressOrders: enabled,
    orderProgressionDelaysMs: delays ? { ...delays } : null,
  };
}

export function advanceQaClock(state: QaScenarioState, offsetMs: number): QaScenarioState {
  if (!Number.isFinite(offsetMs) || offsetMs <= 0) {
    throw new Error('O avanço do relógio deve ser positivo.');
  }

  return { ...state, clockOffsetMs: state.clockOffsetMs + offsetMs };
}
