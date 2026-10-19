import { describe, expect, it } from 'vitest';

import { resolveAsaasConfig } from './config';
import type { EnvReader } from './config';

function envFrom(values: Record<string, string | undefined>): EnvReader {
  return { get: (key: string) => values[key] };
}

describe('resolveAsaasConfig (Story 7.2, AC2 — fecha CARRY-001 da Story 7.1)', () => {
  it('ausente (nenhuma env setada): default seguro é sandbox, nunca produção', () => {
    const config = resolveAsaasConfig(envFrom({}));

    expect(config).toEqual({ baseUrl: 'https://api-sandbox.asaas.com/v3', apiKey: '' });
  });

  it('ASAAS_ENVIRONMENT=sandbox (explícito): resolve para a base de sandbox', () => {
    const config = resolveAsaasConfig(envFrom({ ASAAS_ENVIRONMENT: 'sandbox', ASAAS_API_KEY: 'chave-teste' }));

    expect(config).toEqual({ baseUrl: 'https://api-sandbox.asaas.com/v3', apiKey: 'chave-teste' });
  });

  it('ASAAS_ENVIRONMENT=production: resolve para a base de produção', () => {
    const config = resolveAsaasConfig(envFrom({ ASAAS_ENVIRONMENT: 'production', ASAAS_API_KEY: 'chave-prod' }));

    expect(config).toEqual({ baseUrl: 'https://api.asaas.com/v3', apiKey: 'chave-prod' });
  });

  it('valor desconhecido de ASAAS_ENVIRONMENT (ex.: typo) cai no default seguro (sandbox), nunca produção', () => {
    const config = resolveAsaasConfig(envFrom({ ASAAS_ENVIRONMENT: 'produciton' }));

    expect(config.baseUrl).toBe('https://api-sandbox.asaas.com/v3');
  });

  it('ASAAS_BASE_URL setada sempre vence, mesmo sobrepondo ASAAS_ENVIRONMENT=production', () => {
    const config = resolveAsaasConfig(
      envFrom({ ASAAS_ENVIRONMENT: 'production', ASAAS_BASE_URL: 'https://custom.example.com/v3' }),
    );

    expect(config.baseUrl).toBe('https://custom.example.com/v3');
  });

  it('ASAAS_BASE_URL com espaços e barra final: trim + barra final removida', () => {
    const config = resolveAsaasConfig(envFrom({ ASAAS_BASE_URL: '  https://custom.example.com/v3/  ' }));

    expect(config.baseUrl).toBe('https://custom.example.com/v3');
  });

  it('ASAAS_BASE_URL só com espaços (vazia após trim): ignorada, cai no default seguro', () => {
    const config = resolveAsaasConfig(envFrom({ ASAAS_BASE_URL: '   ' }));

    expect(config.baseUrl).toBe('https://api-sandbox.asaas.com/v3');
  });

  it('ASAAS_API_KEY ausente: apiKey resolve para string vazia (validação fica no handler)', () => {
    const config = resolveAsaasConfig(envFrom({ ASAAS_ENVIRONMENT: 'production' }));

    expect(config.apiKey).toBe('');
  });
});
