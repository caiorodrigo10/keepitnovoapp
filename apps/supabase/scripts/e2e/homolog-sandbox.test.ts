import { describe, expect, it } from 'vitest';

import * as homologRunner from './homolog-sandbox.mjs';

const { assertSafeEnvironment, redactId } = homologRunner;

describe('homolog-sandbox safeguards', () => {
  it('accepts only the explicitly approved Supabase project and Asaas sandbox', () => {
    expect(() => assertSafeEnvironment({
      supabaseUrl: 'https://jhhbewnmnorhmsdvfppo.supabase.co',
      asaasBaseUrl: 'https://api-sandbox.asaas.com/v3',
    })).not.toThrow();
  });

  it('refuses a production Asaas base URL before any request can be made', () => {
    expect(() => assertSafeEnvironment({
      supabaseUrl: 'https://jhhbewnmnorhmsdvfppo.supabase.co',
      asaasBaseUrl: 'https://api.asaas.com/v3',
    })).toThrow('ASAAS_SANDBOX_OBRIGATORIO');
  });

  it('refuses every Supabase project except the approved homology project', () => {
    expect(() => assertSafeEnvironment({
      supabaseUrl: 'https://other-project.supabase.co',
      asaasBaseUrl: 'https://api-sandbox.asaas.com/v3',
    })).toThrow('SUPABASE_HOMOLOGACAO_OBRIGATORIO');
  });

  it('redacts identifiers deterministically for reports', () => {
    expect(redactId('12345678-1234-1234-1234-123456789abc')).toBe('12345678…789abc');
  });

  it('retries a sandbox transfer on different documented Pix test keys after a duplicate conflict', () => {
    expect(homologRunner.sandboxPixTransferKeys).toBeTypeOf('function');
    expect(homologRunner.sandboxPixTransferKeys('e2e-20261016-abcd1234')).toEqual([
      'cliente-a00001@pix.bcb.gov.br',
      'cliente-a00002@pix.bcb.gov.br',
      'cliente-a00003@pix.bcb.gov.br',
      'cliente-a00004@pix.bcb.gov.br',
      'cliente-a00005@pix.bcb.gov.br',
    ]);
  });

  it('retries only the Asaas duplicate-transfer conflict', () => {
    expect(homologRunner.isDuplicateSandboxTransferConflict).toBeTypeOf('function');
    expect(homologRunner.isDuplicateSandboxTransferConflict(new Error('HTTP_409:CHECKOUT_ALREADY_REQUESTED'))).toBe(true);
    expect(homologRunner.isDuplicateSandboxTransferConflict(new Error('HTTP_409:OUTRO_CONFLITO'))).toBe(false);
    expect(homologRunner.isDuplicateSandboxTransferConflict(new Error('HTTP_400:CHECKOUT_ALREADY_REQUESTED'))).toBe(false);
  });

  it('uses the next documented key only when Asaas reports a duplicate transfer', async () => {
    expect(homologRunner.createSandboxTransferWithDuplicateFallback).toBeTypeOf('function');
    const attemptedKeys: string[] = [];
    const result = await homologRunner.createSandboxTransferWithDuplicateFallback('e2e-20261016-abcd1234', async (pixAddressKey: string) => {
      attemptedKeys.push(pixAddressKey);
      if (attemptedKeys.length === 1) throw new Error('HTTP_409:CHECKOUT_ALREADY_REQUESTED');
      return { id: 'transfer-2', pixAddressKey };
    });

    expect(attemptedKeys).toEqual(['cliente-a00001@pix.bcb.gov.br', 'cliente-a00002@pix.bcb.gov.br']);
    expect(result).toEqual({ id: 'transfer-2', pixAddressKey: 'cliente-a00002@pix.bcb.gov.br' });
  });
});
