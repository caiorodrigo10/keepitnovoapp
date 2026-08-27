/**
 * Handler puro da Edge Function `asaas-payment-webhook` — Story 7.5 (AC1–AC5),
 * ESTENDIDO pela Story 7.11 (AC1–AC4) para o evento `PAYMENT_CHARGEBACK_REQUESTED`.
 *
 * NUNCA importa `Deno` (só `index.ts`, o entrypoint `Deno.serve`, faz essa
 * ponte). `deps` injeta o token esperado (`ASAAS_WEBHOOK_TOKEN`, já resolvido
 * pelo `index.ts`) e um repositório mínimo (`PagamentosRepo`, interface
 * própria deste módulo — não o tipo `SupabaseClient`), mantendo este arquivo
 * 100% testável sob Vitest sem nenhum setup de Supabase real (mesmo padrão de
 * `PedidosRepo`/`asaasClient` injetados das Stories 7.1/7.2).
 *
 * Diferente da 7.2, este webhook é um RECEPTOR: o Asaas chama a Keepit (não o
 * inverso), autenticado por um segredo compartilhado (`asaas-access-token`),
 * nunca por sessão de usuário.
 *
 * Fluxo (ordem importa — auth SEMPRE primeiro, AUTHZ-001, agora cobrindo
 * também o caminho de chargeback):
 *   1. `!deps.webhookToken || input.headerToken !== deps.webhookToken` → 401,
 *      NENHUM método do repositório (nem `confirmarPagamento` nem
 *      `registrarChargeback`) é chamado. Fail-closed: um `ASAAS_WEBHOOK_TOKEN`
 *      vazio nunca "casa" com um header também vazio.
 *   2. Parse defensivo de `body` (tipo `unknown`, type guards — nunca `as`
 *      cego): precisa de `event: string` e `payment: { id?; externalReference? }`.
 *      Forma inválida → 200 `resultado:'payload_invalido'`, repo não chamado.
 *   3. Evento em `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` → fluxo já existente
 *      da 7.5, inalterado (chama `deps.pedidos.confirmarPagamento`).
 *   4. Evento `PAYMENT_CHARGEBACK_REQUESTED` (Story 7.11) → mesmo parse de
 *      `asaasPaymentId`/`externalReference`; sem nenhum dos dois → 200
 *      `resultado:'payload_invalido'`, repo não chamado; senão chama
 *      `deps.pedidos.registrarChargeback(...)` — lança (falha real de
 *      infraestrutura/DB) → 502; mapeia `resultado` → 200 sempre.
 *      `PAYMENT_REFUNDED` fica FORA de escopo desta Story (ver Story 7.11,
 *      "Reconciliação com o épico" — pertence a um futuro fluxo de
 *      estorno/reembolso, sem Story dona hoje).
 *   5. Qualquer outro evento (nem pagamento nem chargeback) → 200
 *      `resultado:'evento_ignorado'`, repo não chamado (comportamento já
 *      existente da 7.5, preservado).
 *   6. Mapeia `resultado` da RPC (`confirmado`/`ja_processado`/
 *      `pedido_nao_encontrado`) → sempre 200 (idempotência/IDEMP-001,
 *      "at least once" do Asaas nunca deve gerar retry infinito — AC5/7.5,
 *      AC3/7.11).
 */

export type ResultadoConfirmacao = 'confirmado' | 'ja_processado' | 'pedido_nao_encontrado';
export type ResultadoChargeback = 'confirmado' | 'ja_processado' | 'pedido_nao_encontrado';

export interface PagamentosRepo {
  confirmarPagamento(input: {
    asaasPaymentId: string;
    externalReference: string | null;
  }): Promise<{ resultado: ResultadoConfirmacao; pedidoId: string | null }>;

  /** NOVO — Story 7.11. RPC `registrar_chargeback_pedido` via `index.ts`. */
  registrarChargeback(input: {
    asaasPaymentId: string;
    externalReference: string | null;
  }): Promise<{ resultado: ResultadoChargeback; pedidoId: string | null }>;
}

export interface WebhookAsaasDeps {
  /** ASAAS_WEBHOOK_TOKEN resolvido pelo index.ts — nunca lido aqui via Deno.env. */
  webhookToken: string;
  pedidos: PagamentosRepo;
}

export interface WebhookAsaasInput {
  /** Valor do header `asaas-access-token`, lido pelo index.ts. */
  headerToken: string | null | undefined;
  /** Body JSON bruto do request — validado dentro do handler. */
  body: unknown;
}

export type WebhookAsaasResult =
  | { status: 200; body: { ok: true; resultado: string; pedido_id?: string | null } }
  | { status: 401; body: { ok: false; error: { code: 'TOKEN_INVALIDO'; message: string } } }
  | { status: 502; body: { ok: false; error: { code: string; message: string } } };

const EVENTOS_PAGAMENTO = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'] as const;
/** Story 7.11 — só `PAYMENT_CHARGEBACK_REQUESTED`. `PAYMENT_REFUNDED` fica
 * fora de escopo (ver cabeçalho deste arquivo). */
const EVENTOS_CHARGEBACK = ['PAYMENT_CHARGEBACK_REQUESTED'] as const;

interface AsaasWebhookPayload {
  event: string;
  payment: {
    id?: string;
    externalReference?: string | null;
  };
}

/** Type guard defensivo — `body` é `unknown`, nunca `as` cego. */
function isAsaasWebhookPayload(body: unknown): body is AsaasWebhookPayload {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.event !== 'string') {
    return false;
  }
  if (typeof candidate.payment !== 'object' || candidate.payment === null) {
    return false;
  }
  const payment = candidate.payment as Record<string, unknown>;
  if (payment.id !== undefined && typeof payment.id !== 'string') {
    return false;
  }
  if (
    payment.externalReference !== undefined &&
    payment.externalReference !== null &&
    typeof payment.externalReference !== 'string'
  ) {
    return false;
  }
  return true;
}

export async function handleAsaasWebhook(
  input: WebhookAsaasInput,
  deps: WebhookAsaasDeps,
): Promise<WebhookAsaasResult> {
  // 1) Auth ANTES de qualquer acesso ao repositório (AUTHZ-001). Fail-closed:
  //    token de ambiente vazio nunca "casa" com header ausente/vazio.
  if (!deps.webhookToken || input.headerToken !== deps.webhookToken) {
    return {
      status: 401,
      body: { ok: false, error: { code: 'TOKEN_INVALIDO', message: 'Header asaas-access-token ausente ou inválido.' } },
    };
  }

  // 2) Parse defensivo do payload.
  if (!isAsaasWebhookPayload(input.body)) {
    return { status: 200, body: { ok: true, resultado: 'payload_invalido' } };
  }

  const asaasPaymentId = input.body.payment.id ?? null;
  const externalReference = input.body.payment.externalReference ?? null;
  const event = input.body.event;

  // 3) Evento de pagamento (PAYMENT_RECEIVED/PAYMENT_CONFIRMED) — fluxo já
  //    existente da 7.5, inalterado.
  if (EVENTOS_PAGAMENTO.includes(event as (typeof EVENTOS_PAGAMENTO)[number])) {
    if (!asaasPaymentId && !externalReference) {
      return { status: 200, body: { ok: true, resultado: 'payload_invalido' } };
    }

    // Chama o repositório (RPC confirmar_pagamento_pedido via index.ts).
    // Erro lançado = falha real de infraestrutura → 502 (o Asaas deve re-tentar).
    let resultado: { resultado: ResultadoConfirmacao; pedidoId: string | null };
    try {
      resultado = await deps.pedidos.confirmarPagamento({
        asaasPaymentId: asaasPaymentId ?? '',
        externalReference,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha desconhecida ao confirmar pagamento.';
      return { status: 502, body: { ok: false, error: { code: 'CONFIRMACAO_FALHOU', message } } };
    }

    // 'pedido_nao_encontrado' é logado (não é erro do chamador — Asaas não
    // deve re-tentar por isso), mas ainda responde 2xx (AC5).
    if (resultado.resultado === 'pedido_nao_encontrado') {
      console.warn(
        `[asaas-payment-webhook] pedido_nao_encontrado — asaasPaymentId=${asaasPaymentId ?? '(nenhum)'} externalReference=${externalReference ?? '(nenhum)'}`,
      );
    }

    return { status: 200, body: { ok: true, resultado: resultado.resultado, pedido_id: resultado.pedidoId } };
  }

  // 4) Evento de chargeback (PAYMENT_CHARGEBACK_REQUESTED) — Story 7.11.
  //    PAYMENT_REFUNDED fica FORA de escopo (ver cabeçalho deste arquivo).
  if (EVENTOS_CHARGEBACK.includes(event as (typeof EVENTOS_CHARGEBACK)[number])) {
    if (!asaasPaymentId && !externalReference) {
      return { status: 200, body: { ok: true, resultado: 'payload_invalido' } };
    }

    // Chama o repositório (RPC registrar_chargeback_pedido via index.ts).
    // Erro lançado = falha real de infraestrutura → 502 (o Asaas deve re-tentar).
    let resultado: { resultado: ResultadoChargeback; pedidoId: string | null };
    try {
      resultado = await deps.pedidos.registrarChargeback({
        asaasPaymentId: asaasPaymentId ?? '',
        externalReference,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha desconhecida ao registrar chargeback.';
      return { status: 502, body: { ok: false, error: { code: 'CHARGEBACK_FALHOU', message } } };
    }

    if (resultado.resultado === 'pedido_nao_encontrado') {
      console.warn(
        `[asaas-payment-webhook] chargeback pedido_nao_encontrado — asaasPaymentId=${asaasPaymentId ?? '(nenhum)'} externalReference=${externalReference ?? '(nenhum)'}`,
      );
    }

    return { status: 200, body: { ok: true, resultado: resultado.resultado, pedido_id: resultado.pedidoId } };
  }

  // 5) Qualquer outro evento (nem pagamento nem chargeback) — 2xx sempre,
  //    sem chamar nenhum método do repo (comportamento já existente da 7.5).
  return { status: 200, body: { ok: true, resultado: 'evento_ignorado' } };
}
