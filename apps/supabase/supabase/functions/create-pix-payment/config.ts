/**
 * Resolução segura de `AsaasClientConfig` a partir de env — Story 7.2 (AC2).
 *
 * Fecha o CARRY-001 do gate da Story 7.1
 * (`docs/qa/gates/7.1-asaas-client.yaml`): a derivação de base URL do Asaas
 * NUNCA cai em produção por omissão. `resolveAsaasConfig` é uma função pura,
 * testável sem `Deno` — recebe um `EnvReader` injetado em vez de ler
 * `Deno.env` diretamente. Só `index.ts` (o entrypoint `Deno.serve` desta
 * Edge Function) monta a ponte real com `Deno.env.get(...)`.
 *
 * Regras (AC2):
 *   1. Se `ASAAS_BASE_URL` estiver setada (não vazia após `trim()`), ela
 *      SEMPRE vence — sem barra final.
 *   2. Senão, deriva de `ASAAS_ENVIRONMENT`: `=== 'production'` → base de
 *      produção; QUALQUER outro valor (incluindo ausente/vazio/desconhecido)
 *      → base de sandbox. Este é o default seguro — nunca produção por
 *      omissão.
 *   3. `apiKey` vem de `ASAAS_API_KEY` (string vazia se ausente — validar a
 *      chave não é responsabilidade desta função; ver `handler.ts`, que
 *      propaga o erro do Asaas se a chave for inválida/vazia).
 */

export interface EnvReader {
  get(key: string): string | undefined;
}

export interface ResolvedAsaasConfig {
  baseUrl: string;
  apiKey: string;
}

const ASAAS_BASE_URL_PRODUCTION = 'https://api.asaas.com/v3';
/** Default seguro — nunca produção por omissão (CARRY-001). */
const ASAAS_BASE_URL_SANDBOX = 'https://api-sandbox.asaas.com/v3';

export function resolveAsaasConfig(env: EnvReader): ResolvedAsaasConfig {
  const apiKey = env.get('ASAAS_API_KEY') ?? '';

  const explicitBaseUrl = env.get('ASAAS_BASE_URL')?.trim();
  if (explicitBaseUrl) {
    return { baseUrl: explicitBaseUrl.replace(/\/+$/, ''), apiKey };
  }

  const environment = env.get('ASAAS_ENVIRONMENT')?.trim();
  const baseUrl = environment === 'production' ? ASAAS_BASE_URL_PRODUCTION : ASAAS_BASE_URL_SANDBOX;
  return { baseUrl, apiKey };
}
