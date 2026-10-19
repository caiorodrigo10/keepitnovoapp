import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

import { formatBuildInfoRows, resolveBuildInfo, resolveRuntimeBuildEnv } from './buildInfo';

describe('resolveBuildInfo', () => {
  it('prioriza os metadados calculados pelo Expo config sobre variáveis públicas antigas', () => {
    expect(resolveRuntimeBuildEnv(
      { commitSha: 'novo-commit-do-build', buildDate: '2026-10-17T17:00:00.000Z' },
      { commitSha: 'commit-antigo', buildDate: '2026-09-05T00:00:00.000Z' },
    )).toEqual({ commitSha: 'novo-commit-do-build', buildDate: '2026-10-17T17:00:00.000Z' });
  });

  it('prioriza o módulo gerado no pre-build, que o Metro incorpora ao bundle', () => {
    expect(resolveRuntimeBuildEnv(
      { commitSha: 'manifesto', buildDate: '2026-10-17T17:00:00.000Z' },
      { commitSha: 'legado', buildDate: '2026-09-05T00:00:00.000Z' },
      { commitSha: 'modulo-do-build', buildDate: '2026-10-17T18:00:00.000Z' },
    )).toEqual({ commitSha: 'modulo-do-build', buildDate: '2026-10-17T18:00:00.000Z' });
  });
  it('combina a configuração e variáveis QA nas cinco linhas canônicas, sem o commit', () => {
    const info = resolveBuildInfo(
      { version: '1.0.0', versionCode: 4 },
      {
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        buildDate: '2026-09-04T12:00:00.000Z',
        appEnv: 'qa',
        qaEnabled: 'true',
        dataSource: 'mock',
      },
    );

    expect(info.qaEnabled).toBe(true);
    expect(formatBuildInfoRows(info)).toEqual([
      { label: 'Versão', value: '1.0.0' },
      { label: 'VersionCode', value: '4' },
      { label: 'Datasource', value: 'mock' },
      { label: 'Ambiente', value: 'qa' },
      { label: 'Data do build', value: '2026-09-04T12:00:00.000Z' },
    ]);
  });

  it('usa fallbacks honestos no desenvolvimento', () => {
    expect(resolveBuildInfo({ version: '1.0.0', versionCode: 4 }, {})).toMatchObject({
      commitSha: 'local',
      buildDate: 'unknown',
      environment: 'local',
      dataSource: 'mock',
      qaEnabled: false,
    });
  });

  it('desliga QA para qualquer valor diferente da string true', () => {
    expect(resolveBuildInfo({ version: '1.0.0', versionCode: 4 }, { qaEnabled: 'false' }).qaEnabled).toBe(false);
    expect(resolveBuildInfo({ version: '1.0.0', versionCode: 4 }, { qaEnabled: 'TRUE' }).qaEnabled).toBe(false);
  });
});
