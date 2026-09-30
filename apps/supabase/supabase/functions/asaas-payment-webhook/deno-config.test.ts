import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('asaas-payment-webhook Deno config', () => {
  it('resolve imports bare usados pelo entrypoint', () => {
    const config = JSON.parse(readFileSync(new URL('./deno.json', import.meta.url), 'utf8')) as {
      imports?: Record<string, string>;
    };

    expect(config.imports?.['@supabase/supabase-js']).toMatch(/^npm:@supabase\/supabase-js@/);
    expect(config.imports?.['@keepit/shared-types']).toBe('../../../../../packages/shared-types/src/supabase.ts');
  });
});
