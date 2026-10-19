/**
 * Sobrescrito pelo hook eas-build-pre-install. Os valores vazios preservam o
 * fallback do Expo config ao executar localmente, sem carregar metadados velhos.
 */
export const GENERATED_BUILD_INFO = {
  commitSha: '',
  buildDate: '',
};
