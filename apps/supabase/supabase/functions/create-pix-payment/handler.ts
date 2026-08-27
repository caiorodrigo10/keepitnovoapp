/**
 * Handler puro da Edge Function `create-pix-payment` — Story 7.2 (AC4).
 *
 * NUNCA importa `Deno` (só `index.ts`, o entrypoint `Deno.serve`, faz essa
 * ponte). `deps` injeta o client Asaas (`_shared/asaas.ts`, Story 7.1) e um
 * repositório mínimo (`PedidosRepo`, interface própria deste módulo — não o
 * tipo `SupabaseClient`), mantendo este arquivo 100% testável sob Vitest sem
 * nenhum setup de Supabase real (mesmo padrão de `fetchImpl` injetado em
 * `asaas.test.ts`, Story 7.1).
 *
 * Fluxo:
 *   1. Busca o pedido (`404 PEDIDO_NAO_ENCONTRADO` se não achar).
 *   2. Idempotência: se as 3 colunas de cobrança já estão preenchidas,
 *      retorna esses valores direto, SEM chamar `asaasClient`.
 *   3. `cliente_cpf` nulo → `422 CLIENTE_SEM_CPF` (defensivo — não deveria
 *      acontecer dado o gate de checkout, Story 6.5, ver Dependencies da
 *      Story).
 *   4. `criarCliente` → `criarCobranca` (PIX, `dueDate` = hoje via
 *      `deps.now()`) → `obterQrCodePix` → `pedidos.salvarCobrancaPix(...)`.
 *   5. Qualquer etapa do Asaas que falhe (`ok: false`) propaga um erro
 *      tipado, sem continuar as etapas seguintes.
 */

import type { AsaasClient } from '../_shared/asaas';

export interface PedidoParaCobranca {
  id: string;
  cliente_nome: string;
  cliente_cpf: string | null;
  total_pago_reais: number;
  asaas_payment_id: string | null;
  qr_code_pix: string | null;
  pix_copia_e_cola: string | null;
}

export interface PedidosRepo {
  getById(pedidoId: string): Promise<PedidoParaCobranca | null>;
  salvarCobrancaPix(
    pedidoId: string,
    fields: { asaas_payment_id: string; qr_code_pix: string; pix_copia_e_cola: string },
  ): Promise<void>;
}

export interface CreatePixPaymentDeps {
  asaasClient: AsaasClient;
  pedidos: PedidosRepo;
  /** Injetável para teste; default = `() => new Date()`. */
  now?: () => Date;
}

export interface PixChargeFields {
  asaas_payment_id: string;
  qr_code_pix: string;
  pix_copia_e_cola: string;
}

export type CreatePixPaymentResult =
  | { ok: true; data: PixChargeFields }
  | { ok: false; error: { status: number; code: string; message: string } };

/** `YYYY-MM-DD`, formato exigido pelo campo `dueDate` do Asaas. */
function formatDueDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function handleCreatePixPayment(
  input: { pedido_id: string },
  deps: CreatePixPaymentDeps,
): Promise<CreatePixPaymentResult> {
  const pedido = await deps.pedidos.getById(input.pedido_id);
  if (!pedido) {
    return {
      ok: false,
      error: { status: 404, code: 'PEDIDO_NAO_ENCONTRADO', message: `Pedido não encontrado: ${input.pedido_id}` },
    };
  }

  // Idempotência (AC4): pedido já tem cobrança persistida — nunca chama o Asaas de novo.
  if (pedido.asaas_payment_id && pedido.qr_code_pix && pedido.pix_copia_e_cola) {
    return {
      ok: true,
      data: {
        asaas_payment_id: pedido.asaas_payment_id,
        qr_code_pix: pedido.qr_code_pix,
        pix_copia_e_cola: pedido.pix_copia_e_cola,
      },
    };
  }

  if (!pedido.cliente_cpf) {
    return {
      ok: false,
      error: {
        status: 422,
        code: 'CLIENTE_SEM_CPF',
        message: `Pedido ${pedido.id} — cliente sem CPF cadastrado, não é possível criar cobrança Asaas.`,
      },
    };
  }

  const clienteResult = await deps.asaasClient.criarCliente({
    name: pedido.cliente_nome,
    cpfCnpj: pedido.cliente_cpf,
    externalReference: pedido.id,
  });
  if (!clienteResult.ok) {
    return { ok: false, error: asaasErrorToHandlerError(clienteResult.error) };
  }

  const now = deps.now?.() ?? new Date();
  const cobrancaResult = await deps.asaasClient.criarCobranca({
    customer: clienteResult.data.id,
    billingType: 'PIX',
    value: pedido.total_pago_reais,
    dueDate: formatDueDate(now),
    externalReference: pedido.id,
  });
  if (!cobrancaResult.ok) {
    return { ok: false, error: asaasErrorToHandlerError(cobrancaResult.error) };
  }

  const qrCodeResult = await deps.asaasClient.obterQrCodePix(cobrancaResult.data.id);
  if (!qrCodeResult.ok) {
    return { ok: false, error: asaasErrorToHandlerError(qrCodeResult.error) };
  }

  const fields: PixChargeFields = {
    asaas_payment_id: cobrancaResult.data.id,
    qr_code_pix: qrCodeResult.data.encodedImage,
    pix_copia_e_cola: qrCodeResult.data.payload,
  };

  await deps.pedidos.salvarCobrancaPix(pedido.id, fields);

  return { ok: true, data: fields };
}

/** Normaliza `AsaasError` (`_shared/asaas.ts`) para o formato de erro deste handler. Nunca repassa segredos (o Asaas nunca devolve `apiKey` no corpo de erro). */
function asaasErrorToHandlerError(error: { status: number; code?: string; message: string }): {
  status: number;
  code: string;
  message: string;
} {
  return {
    status: error.status === 0 ? 502 : error.status,
    code: error.code ?? 'ASAAS_ERRO',
    message: error.message,
  };
}
