import { expect, it } from 'vitest';

it('apresenta somente a data gerada para a tela de configurações, sem o commit', async () => {
  const { formatBuildMetadataRows } = await import('./buildInfo');

  expect(formatBuildMetadataRows({ commitSha: '1234567890abcdef', buildDate: '2026-10-17T12:00:00.000Z' })).toEqual([
    { label: 'Data do build', value: '2026-10-17T12:00:00.000Z' },
  ]);
});
