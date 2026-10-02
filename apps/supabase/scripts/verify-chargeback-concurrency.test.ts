import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const command = fileURLToPath(new URL('./verify-chargeback-concurrency.mjs', import.meta.url));
const directScripts = [
  '../supabase/tests/database/chargebacks_concurrency.py',
  '../supabase/tests/database/chargeback_refund_concurrency.py',
].map((path) => fileURLToPath(new URL(path, import.meta.url)));

describe('verificação local de concorrência de chargeback', () => {
  it('recusa execução sem conexão explicitamente marcada como descartável', () => {
    const env = { ...process.env };
    delete env.KEEPIT_DISPOSABLE_DB;
    delete env.SUPABASE_DB_CONTAINER;
    delete env.SUPABASE_DB_NAME;

    const result = spawnSync(process.execPath, [command], { env, encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('KEEPIT_DISPOSABLE_DB=1');
    expect(result.stderr).toContain('SUPABASE_DB_CONTAINER');
    expect(result.stderr).toContain('SUPABASE_DB_NAME');
  });

  it.each(directScripts)('recusa execução direta sem confirmação descartável: %s', (script) => {
    const env = {
      ...process.env,
      SUPABASE_DB_CONTAINER: 'guard-must-exit-before-docker',
      SUPABASE_DB_NAME: 'postgres',
    };
    delete env.KEEPIT_DISPOSABLE_DB;

    const result = spawnSync('python3', [script], { env, encoding: 'utf8' });

    expect(result.stderr).toContain('KEEPIT_DISPOSABLE_DB=1');
    expect(result.status).not.toBe(0);
  });
});
