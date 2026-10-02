import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const required = ['SUPABASE_DB_CONTAINER', 'SUPABASE_DB_NAME'];
const missing = required.filter((name) => !process.env[name]);

if (process.env.KEEPIT_DISPOSABLE_DB !== '1' || missing.length > 0) {
  process.stderr.write(
    'Execução recusada. Informe KEEPIT_DISPOSABLE_DB=1, SUPABASE_DB_CONTAINER e '
    + 'SUPABASE_DB_NAME para uma instância PostgreSQL local descartável.\n',
  );
  process.exit(2);
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tests = [
  'supabase/tests/database/chargebacks_concurrency.py',
  'supabase/tests/database/chargeback_refund_concurrency.py',
];

for (const test of tests) {
  const result = spawnSync('python3', [resolve(appRoot, test)], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
