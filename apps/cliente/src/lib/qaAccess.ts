/** Gate único: a flag de build nunca basta sem a capability exclusiva do mock. */
export function isQaRuntimeEnabled(qaBuildEnabled: boolean, demoScenario: unknown): boolean {
  return qaBuildEnabled && Boolean(demoScenario);
}

export function getQaPerfilRouteNames(enabled: boolean): readonly 'PainelQA'[] {
  return enabled ? ['PainelQA'] : [];
}

export function registerVersionTap(current: number): { nextCount: number; shouldOpen: boolean } {
  const next = current + 1;
  return next === 7
    ? { nextCount: 0, shouldOpen: true }
    : { nextCount: next, shouldOpen: false };
}
