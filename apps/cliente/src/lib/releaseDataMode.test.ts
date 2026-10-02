import { describe, expect, it } from 'vitest';

import { resolveDataMode } from '@keepit/core-data';
import app from '../../app.json';
import eas from '../../eas.json';

interface ReleaseEnvironment {
  EXPO_PUBLIC_DATA_SOURCE?: string;
  EXPO_PUBLIC_APP_ENV?: string;
}

describe('configuração de release do Cliente', () => {
  it('mantém os identificadores nativos alinhados ao scheme', () => {
    expect(app.expo.ios.bundleIdentifier).toBe(app.expo.scheme);
    expect(app.expo.android.package).toBe(app.expo.scheme);
  });

  it('versiona builds localmente com incremento automático', () => {
    expect(eas.cli.appVersionSource).toBe('local');
    expect(eas.build.production.autoIncrement).toBe(true);
  });

  it('gera o perfil de produção para loja e com datasource real', () => {
    const production = eas.build.production.env as ReleaseEnvironment;

    expect(eas.build.production.distribution).toBe('store');
    expect(eas.build.production.environment).toBe('production');
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(resolveDataMode(production.EXPO_PUBLIC_DATA_SOURCE, production.EXPO_PUBLIC_APP_ENV))
      .toBe('supabase');
    expect(() => resolveDataMode('mock', production.EXPO_PUBLIC_APP_ENV))
      .toThrow('DATA_SOURCE_MOCK_EM_PRODUCAO');
  });

  it('preserva mock somente nos perfis de demonstração fora de produção', () => {
    for (const profile of [eas.build.demo, eas.build['demo-apk']]) {
      const environment = profile.env as ReleaseEnvironment;
      expect(profile.environment).toBe('preview');
      expect(resolveDataMode(environment.EXPO_PUBLIC_DATA_SOURCE, environment.EXPO_PUBLIC_APP_ENV))
        .toBe('mock');
    }
  });
});
