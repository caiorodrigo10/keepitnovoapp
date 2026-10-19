import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function resolveCommitSha() {
  if (process.env.EAS_BUILD_GIT_COMMIT_HASH) return process.env.EAS_BUILD_GIT_COMMIT_HASH;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

const target = fileURLToPath(new URL('../src/config/generatedBuildInfo.ts', import.meta.url));
const generated = `/** Gerado por eas-build-pre-install; não editar manualmente. */\nexport const GENERATED_BUILD_INFO = ${JSON.stringify({ commitSha: resolveCommitSha(), buildDate: new Date().toISOString() }, null, 2)} as const;\n`;
writeFileSync(target, generated);
