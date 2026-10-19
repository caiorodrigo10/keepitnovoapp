/** Metadados que podem permanecer exclusivamente no servidor após tokenizar. */
export interface CardTokenMetadata {
  token: string;
  bandeira: string;
  ultimo4: string;
}

/** Categoria segura para decidir recuperação sem expor a resposta do gateway. */
export interface CardGatewayFailure {
  categoria: 'recusado' | 'token_invalido' | 'indisponivel' | 'incerto';
  code?: string;
}

type GatewayError = { code?: unknown };

function firstCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { errors?: unknown }).errors)) return undefined;
  const first = (value as { errors: GatewayError[] }).errors[0];
  return typeof first?.code === 'string' && first.code.length > 0 ? first.code : undefined;
}

/** Extracts only the three documented fields and discards every other field. */
export function parseCardTokenMetadata(value: unknown): CardTokenMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const token = fields.creditCardToken;
  const bandeira = fields.creditCardBrand;
  const ultimo4 = fields.creditCardNumber;
  if (typeof token !== 'string' || token.trim().length === 0
    || typeof bandeira !== 'string' || bandeira.trim().length === 0
    || typeof ultimo4 !== 'string' || !/^\d{4}$/.test(ultimo4)) return null;
  return { token, bandeira, ultimo4 };
}

/** Task 1 did not establish a token-invalid code, so it is never inferred. */
export function classifyCardGatewayFailure(value: unknown, status: number): CardGatewayFailure {
  const code = firstCode(value);
  if (status === 0 || status === 408 || status === 429 || status >= 500) return { categoria: 'incerto' };
  if (status === 400 && code === 'invalid_creditCard') return { categoria: 'recusado', code };
  if (status === 401 || status === 403 || code === 'invalid_api_key' || code === 'forbidden') {
    return { categoria: 'indisponivel', ...(code ? { code } : {}) };
  }
  return { categoria: 'incerto' };
}
