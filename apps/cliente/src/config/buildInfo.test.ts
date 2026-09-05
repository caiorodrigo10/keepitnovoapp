import { describe, expect, it } from 'vitest';

import { formatBuildInfoRows, resolveBuildInfo } from './buildInfo';

describe('resolveBuildInfo', () => {
  it('combina a configuração e variáveis QA nas seis linhas canônicas', () => {
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
      { label: 'Commit', value: '0123456789ab' },
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
