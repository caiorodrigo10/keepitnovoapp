import { describe, expect, it } from 'vitest';

import app from '../../app.json';
import eas from '../../eas.json';
import { resolveDataMode } from '@keepit/core-data';

interface ReleaseEnvironment {
  EXPO_PUBLIC_DATA_SOURCE?: string;
  EXPO_PUBLIC_APP_ENV?: string;
}

describe('configuração de release do Lojista', () => {
  it('preserva a identidade canônica do app nas configurações Expo e EAS', () => {
    expect(app.expo.slug).toBe('keepit-lojista');
    expect(app.expo.scheme).toBe('com.keepithub.lojista');
    expect(app.expo.ios.bundleIdentifier).toBe('com.keepithub.lojista');
    expect(app.expo.android.package).toBe('com.keepithub.lojista');
    expect(app.expo.extra.eas.projectId).toBe('e6fd72af-f4f1-4f53-801d-0baabd792f8f');
  });

  it('versiona builds localmente com incremento automático', () => {
    expect(eas.cli.appVersionSource).toBe('local');
    expect(eas.build.production.autoIncrement).toBe(true);
  });

  it('mapeia perfis demo para preview e produção para production', () => {
    expect(eas.build.demo.environment).toBe('preview');
    expect(eas.build['demo-apk'].environment).toBe('preview');
    expect(eas.build.production.environment).toBe('production');
  });

  it('marca produção para bloquear mock e preserva os perfis demo', () => {
    const production = eas.build.production.env as ReleaseEnvironment;

    expect(eas.build.production.distribution).toBe('store');
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(resolveDataMode(production.EXPO_PUBLIC_DATA_SOURCE, production.EXPO_PUBLIC_APP_ENV))
      .toBe('supabase');
    expect(() => resolveDataMode('mock', production.EXPO_PUBLIC_APP_ENV))
      .toThrow('DATA_SOURCE_MOCK_EM_PRODUCAO');

    for (const profile of [eas.build.demo, eas.build['demo-apk']]) {
      const environment = profile.env as ReleaseEnvironment;
      expect(environment.EXPO_PUBLIC_APP_ENV).toBe('qa');
      expect(resolveDataMode(environment.EXPO_PUBLIC_DATA_SOURCE, environment.EXPO_PUBLIC_APP_ENV))
        .toBe('mock');
    }
  });

  it('define homologação com Supabase e credenciais remotas de build', () => {
    const homolog = eas.build.homolog as typeof eas.build.production;
    const environment = homolog.env as ReleaseEnvironment;

    expect(homolog.distribution).toBe('store');
    expect(homolog.environment).toBe('preview');
    expect(homolog.autoIncrement).toBe(true);
    expect(homolog.ios?.credentialsSource).toBe('remote');
    expect(homolog.android?.buildType).toBe('app-bundle');
    expect(resolveDataMode(environment.EXPO_PUBLIC_DATA_SOURCE, environment.EXPO_PUBLIC_APP_ENV))
      .toBe('supabase');
    expect(environment.EXPO_PUBLIC_APP_ENV).toBe('homologacao');
  });
});
