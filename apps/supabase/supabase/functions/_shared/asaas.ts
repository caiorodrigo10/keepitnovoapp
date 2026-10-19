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

import {
  classifyCardGatewayFailure,
  parseCardTokenMetadata,
  type CardGatewayFailure,
  type CardTokenMetadata,
} from './card-contract.ts';

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
  /** Classificação sanitizada usada apenas pelos fluxos de cartão. */
  cardFailure?: CardGatewayFailure;
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

/** `docs/gateway/asaas-api-reference.md` item 2 — `POST /v3/payments`, `billingType: "PIX"`. */
export interface AsaasCreatePixPaymentInput {
  customer: string;
  billingType: 'PIX';
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
}

/** Crédito à vista: campos sensíveis existem apenas durante a chamada HTTPS. */
export interface AsaasCardInput {
  holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string;
}
export interface AsaasHolderInput {
  name: string; email: string; cpfCnpj: string; postalCode: string; addressNumber: string; phone: string;
}
export interface AsaasCreateCreditCardPaymentWithDetailsInput {
  customer: string; billingType: 'CREDIT_CARD'; value: number; dueDate: string;
  externalReference: string; creditCard: AsaasCardInput; creditCardHolderInfo: AsaasHolderInput; remoteIp: string;
}

export interface AsaasCreateCreditCardPaymentWithTokenInput {
  customer: string; billingType: 'CREDIT_CARD'; value: number; dueDate: string;
  externalReference: string; creditCardToken: string; remoteIp: string;
  creditCard?: never; creditCardHolderInfo?: never;
}

export type AsaasCreateCreditCardPaymentInput = AsaasCreateCreditCardPaymentWithDetailsInput | AsaasCreateCreditCardPaymentWithTokenInput;

export type AsaasCreatePaymentInput = AsaasCreatePixPaymentInput | AsaasCreateCreditCardPaymentInput;

export interface AsaasPayment {
  object?: string;
  id: string;
  status: string;
  value: number;
  netValue?: number;
  billingType: string;
  /** Customer is required only by server-side reconciliation, never public output. */
  customer?: string;
  externalReference?: string;
  invoiceUrl?: string;
  dueDate?: string;
  dateCreated?: string;
  deleted?: boolean;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  /** Gateway refund identifier when the response exposes it; absent is never guessed. */
  refundId?: string;
  /** Restrito ao servidor; nunca é projetado para resposta pública. */
  cardTokenMetadata?: CardTokenMetadata;
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

/** Entrada transitória da tokenização; seus campos são reconstruídos por lista positiva. */
export interface AsaasTokenizeCardInput {
  customer: string;
  creditCard: AsaasCardInput;
  creditCardHolderInfo: AsaasHolderInput;
  remoteIp: string;
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
  /** Consultas pontuais para conciliação; nunca inferem ausência de efeito de uma resposta vazia. */
  consultarCobranca(paymentId: string): Promise<AsaasResult<AsaasPayment>>;
  listarCobrancasPorReferencia(reference: string): Promise<AsaasResult<{ data: AsaasPayment[]; hasMore: boolean }>>;
  /** Busca de recuperação do customer criado sob a referência estável do cliente. */
  listarClientesPorReferencia(reference: string): Promise<AsaasResult<{ data: AsaasCustomer[]; hasMore: boolean }>>;
  /** Exclusão de cobrança ainda não paga; não representa estorno. */
  excluirCobranca(paymentId: string): Promise<AsaasResult<{ id: string; deleted: boolean }>>;
  /** `POST /v3/customers` — chamada HTTP real (AC1). */
  criarCliente(input: AsaasCreateCustomerInput): Promise<AsaasResult<AsaasCustomer>>;
  /** `POST /v3/payments` — PIX, cartão completo ou token mutuamente exclusivo. */
  criarCobranca(input: AsaasCreatePaymentInput): Promise<AsaasResult<AsaasPayment>>;
  /** `GET /v3/payments/{id}/pixQrCode` — chamada HTTP real (AC1). */
  obterQrCodePix(paymentId: string): Promise<AsaasResult<AsaasPixQrCode>>;
  /** `POST /v3/payments/{id}/refund` — chamada HTTP real (AC1). */
  estornarCobranca(paymentId: string, input?: AsaasRefundInput): Promise<AsaasResult<AsaasPayment>>;
  /** `POST /v3/transfers` — chamada HTTP real; reservado/não-chamado em produção no piloto (AC1). */
  criarTransferencia(input: AsaasCreateTransferInput): Promise<AsaasResult<AsaasTransfer>>;
  /** Stub reservado — nunca faz chamada HTTP; devolve `NOT_IMPLEMENTED_PILOT` (AC1). */
  criarSubconta(input?: AsaasCreateSubaccountInput): Promise<AsaasResult<never>>;
  /** `POST /v3/creditCard/tokenizeCreditCard`, sem cobrança. */
  tokenizarCartao(input: AsaasTokenizeCardInput): Promise<AsaasResult<CardTokenMetadata>>;
}

export function createAsaasClient(config: AsaasClientConfig): AsaasClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const apiKey = config.apiKey;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async consultarCobranca(paymentId) {
      return sanitizePaymentResult(await request<unknown>(fetchImpl, baseUrl, apiKey, `/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' }, { sensitive: true }));
    },
    async listarCobrancasPorReferencia(reference) {
      const result = await request<unknown>(fetchImpl, baseUrl, apiKey, `/payments?externalReference=${encodeURIComponent(reference)}&limit=2`, { method: 'GET' });
      if (!result.ok) return result;
      const data = result.data;
      if (!data || typeof data !== 'object' || !Array.isArray((data as { data?: unknown }).data) || typeof (data as { hasMore?: unknown }).hasMore !== 'boolean') {
        return invalidGatewayResponse<{ data: AsaasPayment[]; hasMore: boolean }>();
      }
      const payments = (data as { data: unknown[] }).data.map(sanitizePayment);
      if (payments.some((payment) => payment === null)) return invalidGatewayResponse<{ data: AsaasPayment[]; hasMore: boolean }>();
      return { ok: true, data: { data: payments as AsaasPayment[], hasMore: (data as { hasMore: boolean }).hasMore } };
    },
    async listarClientesPorReferencia(reference) {
      return request<{ data: AsaasCustomer[]; hasMore: boolean }>(fetchImpl, baseUrl, apiKey, `/customers?externalReference=${encodeURIComponent(reference)}&limit=2`, { method: 'GET' });
    },
    async excluirCobranca(paymentId) {
      return request<{ id: string; deleted: boolean }>(fetchImpl, baseUrl, apiKey, `/payments/${encodeURIComponent(paymentId)}`, { method: 'DELETE' });
    },
    async criarCliente(input) {
      return request<AsaasCustomer>(fetchImpl, baseUrl, apiKey, '/customers', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async criarCobranca(input) {
      if (input.billingType === 'CREDIT_CARD') {
        // Lista positiva impede envio acidental de parcelamento e de campos extras.
        const { customer, billingType, value, dueDate, externalReference, remoteIp } = input;
        const token = 'creditCardToken' in input ? input.creditCardToken : undefined;
        const hasFullCard = 'creditCard' in input && input.creditCard !== undefined && input.creditCardHolderInfo !== undefined;
        if ((typeof token === 'string' && hasFullCard) || (typeof token !== 'string' && !hasFullCard)) {
          return { ok: false, error: { status: 0, code: 'CARTAO_FORMA_INVALIDA', message: 'Dados de cartão inválidos.' } };
        }
        const body = typeof token === 'string'
          ? { customer, billingType, value, dueDate, externalReference, remoteIp, creditCardToken: token }
          : fullCardPaymentBody(input as AsaasCreateCreditCardPaymentWithDetailsInput);
        const result = await request<unknown>(fetchImpl, baseUrl, apiKey, '/payments', {
          method: 'POST', body: JSON.stringify(body),
        }, { sensitive: true, cardProcessing: true });
        if (!result.ok) return result;
        const data = sanitizePayment(result.data);
        if (!data || data.billingType !== 'CREDIT_CARD') return invalidGatewayResponse<AsaasPayment>();
        const rawCard = result.data && typeof result.data === 'object' ? (result.data as { creditCard?: unknown }).creditCard : undefined;
        const metadata = parseCardTokenMetadata(rawCard);
        return { ok: true, data: { ...data, ...(metadata ? { cardTokenMetadata: metadata } : {}) } };
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
      const result = await request<unknown>(fetchImpl, baseUrl, apiKey, `/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: 'POST',
        body: input ? JSON.stringify(input) : undefined,
      }, { sensitive: true });
      return sanitizePaymentResult(result);
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

    async tokenizarCartao(input) {
      const result = await request<unknown>(fetchImpl, baseUrl, apiKey, '/creditCard/tokenizeCreditCard', {
        method: 'POST', body: JSON.stringify(tokenizeCardBody(input)),
      }, { sensitive: true, cardProcessing: true });
      if (!result.ok) return result;
      const metadata = parseCardTokenMetadata(result.data);
      return metadata ? { ok: true, data: metadata } : invalidGatewayResponse<CardTokenMetadata>();
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
  options: { sensitive?: boolean; cardProcessing?: boolean } = {},
): Promise<AsaasResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      method: init.method,
      body: init.body,
      signal: AbortSignal.timeout(options.cardProcessing ? 60_000 : 15_000),
      headers: {
        access_token: apiKey,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    return {
      ok: false,
      error: {
        status: 0,
        message: `Erro de rede ao chamar o Asaas (${init.method} ${path}).`,
        // Exceções de transporte podem conter o request inteiro: nunca propagá-las.
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
        code: options.sensitive ? 'CARD_GATEWAY_ERROR' : firstError?.code,
        message: options.sensitive ? 'Não foi possível processar o cartão.' : firstError?.description ?? `Asaas respondeu ${response.status} para ${init.method} ${path}.`,
        ...(options.sensitive ? { cardFailure: classifyCardGatewayFailure(details, response.status) } : { details }),
      },
    };
  }

  const data = (await safeParseJson(response)) as T;
  return { ok: true, data };
}

function fullCardPaymentBody(input: AsaasCreateCreditCardPaymentWithDetailsInput) {
  const { customer, billingType, value, dueDate, externalReference, remoteIp } = input;
  const { holderName, number, expiryMonth, expiryYear, ccv } = input.creditCard;
  const { name, email, cpfCnpj, postalCode, addressNumber, phone } = input.creditCardHolderInfo;
  return {
    customer, billingType, value, dueDate, externalReference, remoteIp,
    creditCard: { holderName, number, expiryMonth, expiryYear, ccv },
    creditCardHolderInfo: { name, email, cpfCnpj, postalCode, addressNumber, phone },
  };
}

function tokenizeCardBody(input: AsaasTokenizeCardInput) {
  const { customer, remoteIp } = input;
  const { holderName, number, expiryMonth, expiryYear, ccv } = input.creditCard;
  const { name, email, cpfCnpj, postalCode, addressNumber, phone } = input.creditCardHolderInfo;
  return {
    customer, remoteIp,
    creditCard: { holderName, number, expiryMonth, expiryYear, ccv },
    creditCardHolderInfo: { name, email, cpfCnpj, postalCode, addressNumber, phone },
  };
}

function invalidGatewayResponse<T>(): AsaasResult<T> {
  return { ok: false, error: { status: 0, code: 'RESPOSTA_INVALIDA', message: 'Resposta inconclusiva do gateway.' } };
}

function sanitizePayment(value: unknown): AsaasPayment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.status !== 'string' || typeof raw.value !== 'number' || typeof raw.billingType !== 'string') return null;
  const payment: AsaasPayment = { id: raw.id, status: raw.status, value: raw.value, billingType: raw.billingType };
  const optionalStrings = ['object', 'customer', 'externalReference', 'invoiceUrl', 'dueDate', 'dateCreated'] as const;
  for (const key of optionalStrings) if (typeof raw[key] === 'string') payment[key] = raw[key] as never;
  if (typeof raw.netValue === 'number') payment.netValue = raw.netValue;
  const nestedRefund = raw.refund && typeof raw.refund === 'object' && !Array.isArray(raw.refund) ? (raw.refund as Record<string, unknown>).id : undefined;
  const refundId = typeof raw.refundId === 'string' ? raw.refundId : nestedRefund;
  if (typeof refundId === 'string' && refundId.trim()) payment.refundId = refundId;
  if (typeof raw.deleted === 'boolean') payment.deleted = raw.deleted;
  for (const key of ['paymentDate', 'clientPaymentDate'] as const) {
    if (typeof raw[key] === 'string' || raw[key] === null) payment[key] = raw[key] as string | null;
  }
  return payment;
}

function sanitizePaymentResult(result: AsaasResult<unknown>): AsaasResult<AsaasPayment> {
  if (!result.ok) return result;
  const payment = sanitizePayment(result.data);
  return payment ? { ok: true, data: payment } : invalidGatewayResponse<AsaasPayment>();
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
