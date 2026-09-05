import app from '../../app.json';

export interface BuildInfo {
  version: string;
  versionCode: number;
  commitSha: string;
  dataSource: 'mock' | 'supabase';
  environment: string;
  buildDate: string;
  qaEnabled: boolean;
}

export interface PublicBuildEnv {
  commitSha?: string;
  buildDate?: string;
  appEnv?: string;
  qaEnabled?: string;
  dataSource?: string;
}

interface AppBuildConfig {
  version: string;
  versionCode: number;
}

export function resolveBuildInfo(config: AppBuildConfig, env: PublicBuildEnv): BuildInfo {
  return {
    ...config,
    commitSha: env.commitSha?.trim() || 'local',
    buildDate: env.buildDate?.trim() || 'unknown',
    environment: env.appEnv?.trim() || 'local',
    dataSource: env.dataSource?.trim() === 'supabase' ? 'supabase' : 'mock',
    qaEnabled: env.qaEnabled === 'true',
  };
}

export const BUILD_INFO = resolveBuildInfo(
  { version: app.expo.version, versionCode: app.expo.android.versionCode },
  {
    commitSha: process.env.EXPO_PUBLIC_COMMIT_SHA,
    buildDate: process.env.EXPO_PUBLIC_BUILD_DATE,
    appEnv: process.env.EXPO_PUBLIC_APP_ENV,
    qaEnabled: process.env.EXPO_PUBLIC_QA_ENABLED,
    dataSource: process.env.EXPO_PUBLIC_DATA_SOURCE,
  },
);

export const QA_BUILD_ENABLED = BUILD_INFO.qaEnabled;

export function formatBuildInfoRows(info: BuildInfo): Array<{ label: string; value: string }> {
  return [
    { label: 'Versão', value: info.version },
    { label: 'VersionCode', value: String(info.versionCode) },
    { label: 'Commit', value: info.commitSha.length > 12 ? info.commitSha.slice(0, 12) : info.commitSha },
    { label: 'Datasource', value: info.dataSource },
    { label: 'Ambiente', value: info.environment },
    { label: 'Data do build', value: info.buildDate },
  ];
}
