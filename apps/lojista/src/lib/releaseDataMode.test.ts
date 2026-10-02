import { describe, expect, it } from 'vitest';

import eas from '../../eas.json';
import { resolveDataMode } from '@keepit/core-data';

interface ReleaseEnvironment {
  EXPO_PUBLIC_DATA_SOURCE?: string;
  EXPO_PUBLIC_APP_ENV?: string;
}

describe('perfis EAS do Lojista', () => {
  it('mapeia perfis demo para preview e produção para production', () => {
    expect(eas.build.demo.environment).toBe('preview');
    expect(eas.build['demo-apk'].environment).toBe('preview');
    expect(eas.build.production.environment).toBe('production');
  });

  it('marca produção para bloquear mock e preserva os perfis demo', () => {
    const production = eas.build.production.env as ReleaseEnvironment;

    expect(resolveDataMode(production.EXPO_PUBLIC_DATA_SOURCE, production.EXPO_PUBLIC_APP_ENV))
      .toBe('supabase');
    expect(() => resolveDataMode('mock', production.EXPO_PUBLIC_APP_ENV))
      .toThrow('DATA_SOURCE_MOCK_EM_PRODUCAO');

    for (const profile of [eas.build.demo, eas.build['demo-apk']]) {
      const environment = profile.env as ReleaseEnvironment;
      expect(resolveDataMode(environment.EXPO_PUBLIC_DATA_SOURCE, environment.EXPO_PUBLIC_APP_ENV))
        .toBe('mock');
    }
  });
});
