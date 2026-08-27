/**
 * Handler puro da Edge Function `asaas-payment-webhook` — Story 7.5 (AC1–AC5).
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
 * Fluxo (ordem importa — auth SEMPRE primeiro, AUTHZ-001):
 *   1. `!deps.webhookToken || input.headerToken !== deps.webhookToken` → 401,
 *      `deps.pedidos.confirmarPagamento` NUNCA chamado. Fail-closed: um
 *      `ASAAS_WEBHOOK_TOKEN` vazio nunca "casa" com um header também vazio.
 *   2. Parse defensivo de `body` (tipo `unknown`, type guards — nunca `as`
 *      cego): precisa de `event: string` e `payment: { id?; externalReference? }`.
 *      Forma inválida → 200 `resultado:'payload_invalido'`, repo não chamado.
 *   3. Evento fora de `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` → 200
 *      `resultado:'evento_ignorado'`, repo não chamado.
 *   4. Sem `payment.id` E sem `payment.externalReference` → 200
 *      `resultado:'payload_invalido'`, repo não chamado (nenhuma referência
 *      para localizar o pedido).
 *   5. Chama `deps.pedidos.confirmarPagamento(...)` — lança (falha real de
 *      infraestrutura/DB) → 502. Nunca mascara falha transitória como sucesso
 *      (o Asaas DEVE re-tentar nesse caso).
 *   6. Mapeia `resultado` da RPC (`confirmado`/`ja_processado`/
 *      `pedido_nao_encontrado`) → sempre 200 (idempotência/IDEMP-001,
 *      "at least once" do Asaas nunca deve gerar retry infinito — AC5).
 */

export type ResultadoConfirmacao = 'confirmado' | 'ja_processado' | 'pedido_nao_encontrado';

export interface PagamentosRepo {
  confirmarPagamento(input: {
    asaasPaymentId: string;
    externalReference: string | null;
  }): Promise<{ resultado: ResultadoConfirmacao; pedidoId: string | null }>;
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

const EVENTOS_TRATADOS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'] as const;

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

  // 3) Evento fora da lista tratada — 2xx sempre, sem chamar o repo.
  if (!EVENTOS_TRATADOS.includes(input.body.event as (typeof EVENTOS_TRATADOS)[number])) {
    return { status: 200, body: { ok: true, resultado: 'evento_ignorado' } };
  }

  const asaasPaymentId = input.body.payment.id ?? null;
  const externalReference = input.body.payment.externalReference ?? null;

  // 4) Sem nenhuma referência para localizar o pedido — payload inválido.
  if (!asaasPaymentId && !externalReference) {
    return { status: 200, body: { ok: true, resultado: 'payload_invalido' } };
  }

  // 5) Chama o repositório (RPC confirmar_pagamento_pedido via index.ts).
  //    Erro lançado = falha real de infraestrutura → 502 (o Asaas deve re-tentar).
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

  // 6) 'pedido_nao_encontrado' é logado (não é erro do chamador — Asaas não
  //    deve re-tentar por isso), mas ainda responde 2xx (AC5).
  if (resultado.resultado === 'pedido_nao_encontrado') {
    console.warn(
      `[asaas-payment-webhook] pedido_nao_encontrado — asaasPaymentId=${asaasPaymentId ?? '(nenhum)'} externalReference=${externalReference ?? '(nenhum)'}`,
    );
  }

  return { status: 200, body: { ok: true, resultado: resultado.resultado, pedido_id: resultado.pedidoId } };
}
