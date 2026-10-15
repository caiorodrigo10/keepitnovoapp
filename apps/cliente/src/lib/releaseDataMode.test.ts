import { describe, expect, it } from 'vitest';

import { resolveDataMode } from '@keepit/core-data';
import app from '../../app.json';
import eas from '../../eas.json';

interface ReleaseEnvironment {
  EXPO_PUBLIC_DATA_SOURCE?: string;
  EXPO_PUBLIC_APP_ENV?: string;
}

describe('configuração de release do Cliente', () => {
  it('preserva a identidade canônica do app nas configurações Expo e EAS', () => {
    expect(app.expo.slug).toBe('keepit-cliente');
    expect(app.expo.scheme).toBe('com.keepithub.cliente');
    expect(app.expo.ios.bundleIdentifier).toBe('com.keepithub.cliente');
    expect(app.expo.android.package).toBe('com.keepithub.cliente');
    expect(app.expo.extra.eas.projectId).toBe('4335faeb-fcfb-46cd-bd96-41b4c7440bd1');
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
