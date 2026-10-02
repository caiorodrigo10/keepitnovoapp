import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const command = fileURLToPath(new URL('./verify-chargeback-concurrency.mjs', import.meta.url));

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
});
