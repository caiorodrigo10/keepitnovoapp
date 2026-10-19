import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it.each([undefined, '', 'false', '1', 'TRUE', ' true ', 'true'])('flag pública estrita: %s', async (value) => {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_CARD_TOKENIZATION_ENABLED', value ?? '');
  const { CARD_TOKENIZATION_ENABLED } = await import('./featureFlags');
  expect(CARD_TOKENIZATION_ENABLED).toBe(value === 'true');
});
