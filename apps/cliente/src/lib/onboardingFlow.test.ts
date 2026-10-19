import { describe, expect, it } from 'vitest';

import {
  getOnboardingDestination,
  getOnboardingPageFromOffset,
  resolveOnboardingBack,
} from './onboardingFlow';

describe('onboardingFlow', () => {
  it('deriva e limita o índice após qualquer swipe', () => {
    expect(getOnboardingPageFromOffset(0, 320)).toBe(0);
    expect(getOnboardingPageFromOffset(320, 320)).toBe(1);
    expect(getOnboardingPageFromOffset(640, 320)).toBe(2);
    expect(getOnboardingPageFromOffset(999, 320)).toBe(2);
    expect(getOnboardingPageFromOffset(320, 0)).toBe(0);
  });

  it('volta uma página ou exige confirmação na primeira', () => {
    expect(resolveOnboardingBack(2)).toEqual({ kind: 'previous', index: 1 });
    expect(resolveOnboardingBack(1)).toEqual({ kind: 'previous', index: 0 });
    expect(resolveOnboardingBack(0)).toEqual({ kind: 'confirm-exit' });
  });

  it('limita conclusão aos três CTAs explícitos', () => {
    expect(getOnboardingDestination('skip')).toBe('CriarConta');
    expect(getOnboardingDestination('create-account')).toBe('CriarConta');
    expect(getOnboardingDestination('login')).toBe('Login');
  });
});
