/**
 * Cliente HTTP tipado do Asaas — Story 7.1.
 *
 * ## Decisão de arquitetura (missão desta Story, sobrepõe o AC2/Dev Notes
 * literais da story sobre leitura de `Deno.env` dentro deste arquivo):
 *
 * Este módulo é **100% portável e injetável** — não importa nem chama
 * `Deno.env` em nenhum ponto (nem em import-time, nem em runtime). A
 * factory `createAsaasClient(config)` recebe `{ baseUrl, apiKey, fetchImpl? }`
 * já resolvidos pelo chamador. `fetchImpl` default é o `fetch` global (existe
 * nativamente em Node 18+ e no Edge Runtime/Deno 2) — os testes injetam um
 * mock, nunca fazem chamada de rede real.
 *
 * A leitura de `ASAAS_API_KEY`/`ASAAS_ENVIRONMENT`/`ASAAS_BASE_URL` via
 * `Deno.env.get(...)` (incluindo a derivação sandbox/produção descrita no
 * AC2 do épico) fica para o entrypoint da Edge Function que vai consumir
 * este client (Stories 7.2/7.5, fora do escopo desta Story) — é esse
 * entrypoint que monta o `AsaasClientConfig` e passa para esta factory.
 * Motivo: `Deno` não existe no runtime Node usado por `pnpm qa`/Vitest —
 * chamá-lo aqui quebraria o typecheck e os testes deste arquivo.
 *
 * Testes: `vitest run` (ver `apps/supabase/vitest.config.ts` e
 * `apps/supabase/package.json`), não `deno test` — mesma decisão, mesmo
 * motivo (gate do repo é `pnpm qa`, que roda Vitest via Turbo).
 *
 * Shapes de request/response baseados literalmente em
 * `docs/gateway/asaas-api-reference.md` (exceto `criarTransferencia`, cujo
 * shape é best-effort — ver nota no tipo `AsaasCreateTransferInput`).
 */

// ---------------------------------------------------------------------------
// Result / erro uniformes (AC3)
// ---------------------------------------------------------------------------

export type AsaasResult<T> = { ok: true; data: T } | { ok: false; error: AsaasError };

export interface AsaasError {
  /** 0 = erro de rede (fetch rejeitou antes de responder). */
  status: number;
  /** `"NOT_IMPLEMENTED_PILOT"` para os stubs; senão o `code` do primeiro erro devolvido pelo Asaas, se houver. */
  code?: string;
  message: string;
  /** Corpo bruto da resposta de erro, se parseável. Nunca inclui `apiKey`/segredos — só o que o Asaas devolveu. */
  details?: unknown;
}

const NOT_IMPLEMENTED_PILOT = 'NOT_IMPLEMENTED_PILOT';

// ---------------------------------------------------------------------------
// Tipos de request/response (AC1, AC3)
// ---------------------------------------------------------------------------

/** `docs/gateway/asaas-api-reference.md` item 1 — `POST /v3/customers`. */
export interface AsaasCreateCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  externalReference?: string;
}

export interface AsaasCustomer {
  object?: string;
  id: string;
  name: string;
  cpfCnpj: string;
  personType?: 'FISICA' | 'JURIDICA';
  deleted?: boolean;
}

/** `docs/gateway/asaas-api-reference.md` item 2 — `POST /v3/payments`, `billingType: "PIX"` (único caminho ativo no piloto). */
export interface AsaasCreatePixPaymentInput {
  customer: string;
  billingType: 'PIX';
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
}

/**
 * Reservado — cartão de crédito é DEFERIDO no piloto (conta única, sem
 * tokenização). `criarCobranca` aceita este shape só para não travar o tipo
 * union, mas NUNCA faz chamada HTTP para `billingType: 'CREDIT_CARD'` —
 * devolve `NOT_IMPLEMENTED_PILOT` (mesmo tratamento de `criarSubconta`/
 * `tokenizarCartao`). Retomar quando a Story de cartão for reaberta.
 */
export interface AsaasCreateCreditCardPaymentInput {
  customer: string;
  billingType: 'CREDIT_CARD';
  value: number;
  dueDate: string;
  [key: string]: unknown;
}

export type AsaasCreatePaymentInput = AsaasCreatePixPaymentInput | AsaasCreateCreditCardPaymentInput;

export interface AsaasPayment {
  object?: string;
  id: string;
  status: string;
  value: number;
  netValue?: number;
  billingType: string;
  externalReference?: string;
  invoiceUrl?: string;
  dueDate?: string;
  dateCreated?: string;
}

/** `docs/gateway/asaas-api-reference.md` item 3 — `GET /v3/payments/{id}/pixQrCode`. */
export interface AsaasPixQrCode {
  /** PNG base64 do QR code — renderizar direto. */
  encodedImage: string;
  /** BR Code EMV oficial (copia-e-cola). */
  payload: string;
  expirationDate?: string;
}

/** `docs/gateway/asaas-api-reference.md` item 4 — `POST /v3/payments/{id}/refund`. Body opcional; sem body = estorno total. */
export interface AsaasRefundInput {
  value?: number;
  description?: string;
}

/**
 * `docs/gateway/asaas-api-reference.md` item 5 — `POST /v3/transfers`.
 * **Reservado no piloto** (repasse ao lojista é manual pelo admin — Story
 * 7.8), mas implementado como CORE nesta Story por instrução explícita da
 * missão. O shape abaixo é **best-effort**: `asaas-api-reference.md` marca
 * este endpoint como "reservado", sem exemplo de payload. Baseado no
 * padrão público da API Asaas para transferência PIX externa
 * (`pixAddressKey`/`pixAddressKeyType`). **Não verificado contra sandbox
 * real** — confirmar quando ASAAS-1/ASAAS-2 destravarem o teste manual.
 */
export interface AsaasCreateTransferInput {
  value: number;
  pixAddressKey: string;
  pixAddressKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
  description?: string;
  externalReference?: string;
}

/** Best-effort — mesma nota de `AsaasCreateTransferInput`. */
export interface AsaasTransfer {
  id: string;
  status: string;
  value: number;
  effectiveDate?: string;
}

/**
 * Reservado — conta Asaas única no piloto (sem subconta por lojista).
 * `criarSubconta` nunca faz chamada HTTP; o shape é best-effort (padrão
 * público de subconta Asaas), documentado só para não perder o desenho
 * quando a automação de subconta for retomada pós-piloto.
 */
export interface AsaasCreateSubaccountInput {
  name: string;
  email: string;
  cpfCnpj: string;
  [key: string]: unknown;
}

/** Reservado — cartão/tokenização DEFERIDOS no piloto. `tokenizarCartao` nunca faz chamada HTTP. */
export interface AsaasTokenizeCardInput {
  customer: string;
  creditCard: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Config / factory
// ---------------------------------------------------------------------------

export interface AsaasClientConfig {
  /**
   * Base URL do Asaas (ex.: `https://api-sandbox.asaas.com/v3`, sem barra
   * final). Resolvida pelo chamador (Edge Function, via `Deno.env.get(...)`)
   * — este client nunca deriva nem lê env.
   */
  baseUrl: string;
  /** Chave de API do Asaas, enviada no header `access_token`. Resolvida pelo chamador. */
  apiKey: string;
  /** `fetch` a ser usado; default = `fetch` global. Testes injetam um mock — nunca uma chamada de rede real. */
  fetchImpl?: typeof fetch;
}

export interface AsaasClient {
  /** `POST /v3/customers` — chamada HTTP real (AC1). */
  criarCliente(input: AsaasCreateCustomerInput): Promise<AsaasResult<AsaasCustomer>>;
  /** `POST /v3/payments` — só `billingType: 'PIX'` faz chamada HTTP real; `'CREDIT_CARD'` é stub reservado (AC1). */
  criarCobranca(input: AsaasCreatePaymentInput): Promise<AsaasResult<AsaasPayment>>;
  /** `GET /v3/payments/{id}/pixQrCode` — chamada HTTP real (AC1). */
  obterQrCodePix(paymentId: string): Promise<AsaasResult<AsaasPixQrCode>>;
  /** `POST /v3/payments/{id}/refund` — chamada HTTP real (AC1). */
  estornarCobranca(paymentId: string, input?: AsaasRefundInput): Promise<AsaasResult<AsaasPayment>>;
  /** `POST /v3/transfers` — chamada HTTP real; reservado/não-chamado em produção no piloto (AC1). */
  criarTransferencia(input: AsaasCreateTransferInput): Promise<AsaasResult<AsaasTransfer>>;
  /** Stub reservado — nunca faz chamada HTTP; devolve `NOT_IMPLEMENTED_PILOT` (AC1). */
  criarSubconta(input?: AsaasCreateSubaccountInput): Promise<AsaasResult<never>>;
  /** Stub reservado — nunca faz chamada HTTP; devolve `NOT_IMPLEMENTED_PILOT` (AC1). */
  tokenizarCartao(input?: AsaasTokenizeCardInput): Promise<AsaasResult<never>>;
}

export function createAsaasClient(config: AsaasClientConfig): AsaasClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const apiKey = config.apiKey;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async criarCliente(input) {
      return request<AsaasCustomer>(fetchImpl, baseUrl, apiKey, '/customers', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async criarCobranca(input) {
      if (input.billingType !== 'PIX') {
        return notImplementedPilot('criarCobranca — billingType CREDIT_CARD é reservado (cartão deferido no piloto).');
      }
      return request<AsaasPayment>(fetchImpl, baseUrl, apiKey, '/payments', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async obterQrCodePix(paymentId) {
      return request<AsaasPixQrCode>(fetchImpl, baseUrl, apiKey, `/payments/${encodeURIComponent(paymentId)}/pixQrCode`, {
        method: 'GET',
      });
    },

    async estornarCobranca(paymentId, input) {
      return request<AsaasPayment>(fetchImpl, baseUrl, apiKey, `/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: 'POST',
        body: input ? JSON.stringify(input) : undefined,
      });
    },

    async criarTransferencia(input) {
      return request<AsaasTransfer>(fetchImpl, baseUrl, apiKey, '/transfers', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async criarSubconta(_input) {
      return notImplementedPilot('criarSubconta — reservado (conta Asaas única no piloto, sem subconta por lojista).');
    },

    async tokenizarCartao(_input) {
      return notImplementedPilot('tokenizarCartao — reservado (cartão/tokenização deferidos no piloto).');
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function notImplementedPilot<T>(message: string): Promise<AsaasResult<T>> {
  return Promise.resolve({
    ok: false,
    error: { status: 0, code: NOT_IMPLEMENTED_PILOT, message },
  });
}

/**
 * Executa a chamada HTTP e normaliza o resultado em `AsaasResult<T>` —
 * nenhum método público deste client deixa uma exceção escapar (AC3).
 * Nunca inclui `apiKey` na mensagem/`details` de erro — só o corpo de
 * resposta devolvido pelo Asaas (que não contém a chave).
 */
async function request<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  path: string,
  init: { method: string; body?: string },
): Promise<AsaasResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      method: init.method,
      body: init.body,
      headers: {
        access_token: apiKey,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        status: 0,
        message: `Erro de rede ao chamar o Asaas (${init.method} ${path}).`,
        details: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (!response.ok) {
    const details = await safeParseJson(response);
    const firstError = extractFirstError(details);
    return {
      ok: false,
      error: {
        status: response.status,
        code: firstError?.code,
        message: firstError?.description ?? `Asaas respondeu ${response.status} para ${init.method} ${path}.`,
        details,
      },
    };
  }

  const data = (await safeParseJson(response)) as T;
  return { ok: true, data };
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function extractFirstError(details: unknown): { code?: string; description?: string } | undefined {
  if (
    details &&
    typeof details === 'object' &&
    'errors' in details &&
    Array.isArray((details as { errors: unknown }).errors) &&
    (details as { errors: unknown[] }).errors.length > 0
  ) {
    const first = (details as { errors: Array<{ code?: string; description?: string }> }).errors[0];
    return { code: first.code, description: first.description };
  }
  return undefined;
}
