const { execFileSync } = require('node:child_process');

function resolveCommitSha() {
  if (process.env.EAS_BUILD_GIT_COMMIT_HASH) return process.env.EAS_BUILD_GIT_COMMIT_HASH;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    buildInfo: { commitSha: resolveCommitSha(), buildDate: new Date().toISOString() },
  },
});
