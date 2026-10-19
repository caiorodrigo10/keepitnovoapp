import { describe, expect, it } from 'vitest';

import { getQaPerfilRouteNames, isQaRuntimeEnabled, registerVersionTap } from './qaAccess';

describe('isQaRuntimeEnabled', () => {
  it.each([
    { qaBuildEnabled: false, demoScenario: undefined, expected: false },
    { qaBuildEnabled: false, demoScenario: {}, expected: false },
    { qaBuildEnabled: true, demoScenario: undefined, expected: false },
    { qaBuildEnabled: true, demoScenario: {}, expected: true },
  ])(
    'retorna $expected com flag=$qaBuildEnabled e capability=$demoScenario',
    ({ qaBuildEnabled, demoScenario, expected }) => {
      expect(isQaRuntimeEnabled(qaBuildEnabled, demoScenario)).toBe(expected);
    },
  );
});

describe('getQaPerfilRouteNames', () => {
  it('não registra rota QA quando o gate está desligado', () => {
    expect(getQaPerfilRouteNames(false)).toEqual([]);
  });

  it('registra PainelQA quando o gate está ligado', () => {
    expect(getQaPerfilRouteNames(true)).toEqual(['PainelQA']);
  });
});

describe('registerVersionTap', () => {
  it('abre exatamente no sétimo toque e reinicia a contagem', () => {
    let count = 0;
    for (let tap = 1; tap <= 6; tap += 1) {
      const result = registerVersionTap(count);
      count = result.nextCount;
      expect(result.shouldOpen).toBe(false);
    }

    expect(registerVersionTap(count)).toEqual({ nextCount: 0, shouldOpen: true });
  });
});
