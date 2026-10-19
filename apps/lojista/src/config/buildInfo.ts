import { GENERATED_BUILD_INFO } from './generatedBuildInfo';

export interface GeneratedBuildInfo {
  commitSha?: string;
  buildDate?: string;
}

export function formatBuildMetadataRows(info: GeneratedBuildInfo = GENERATED_BUILD_INFO): Array<{ label: string; value: string }> {
  const buildDate = info.buildDate?.trim() || 'unknown';

  return [{ label: 'Data do build', value: buildDate }];
}
