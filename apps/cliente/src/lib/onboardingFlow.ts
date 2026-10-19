export const ONBOARDING_PAGE_COUNT = 3;
export type OnboardingPageIndex = 0 | 1 | 2;
export type OnboardingCompletionAction = 'skip' | 'create-account' | 'login';

export function getOnboardingPageFromOffset(offsetX: number, viewportWidth: number): OnboardingPageIndex {
  if (viewportWidth <= 0) return 0;
  return Math.max(0, Math.min(2, Math.round(offsetX / viewportWidth))) as OnboardingPageIndex;
}

export function resolveOnboardingBack(index: OnboardingPageIndex) {
  return index === 0
    ? ({ kind: 'confirm-exit' } as const)
    : ({ kind: 'previous', index: (index - 1) as OnboardingPageIndex } as const);
}

export function getOnboardingDestination(action: OnboardingCompletionAction): 'CriarConta' | 'Login' {
  return action === 'login' ? 'Login' : 'CriarConta';
}
