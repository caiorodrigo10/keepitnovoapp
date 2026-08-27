/**
 * Fixtures de resposta real do Asaas — Story 7.1.
 *
 * Consolidadas num único módulo `.ts` (em vez dos arquivos `customer.json`
 * / `payment-pix.json` / `pix-qr-code.json` mencionados no AC4 literal da
 * story) por instrução explícita da missão desta Story ("+ `__fixtures__/asaas.fixtures.ts`
 * com os JSONs do reference"). O conteúdo de cada fixture é copiado
 * literalmente dos exemplos de `docs/gateway/asaas-api-reference.md`
 * (extraído da doc oficial em 2026-08-27) — não simplificado, para não
 * mascarar campos que as Stories 7.2/7.5/7.11 vão precisar.
 *
 * `refundFixture` e `transferFixture` não têm exemplo literal na referência
 * (ambos endpoints documentados como sem payload de exemplo/"reservado") —
 * são best-effort, coerentes com os tipos de `asaas.ts` (ver nota lá).
 */

import type { AsaasCustomer, AsaasPayment, AsaasPixQrCode, AsaasTransfer } from '../asaas';

/** `docs/gateway/asaas-api-reference.md` item 1 — `POST /v3/customers` res. */
export const customerFixture: AsaasCustomer = {
  object: 'customer',
  id: 'cus_000005401844',
  name: 'Maria Silva',
  cpfCnpj: '24971563792',
  personType: 'FISICA',
  deleted: false,
};

/** `docs/gateway/asaas-api-reference.md` item 2 — `POST /v3/payments` res (PIX). */
export const paymentPixFixture: AsaasPayment = {
  id: 'pay_080225913252',
  object: 'payment',
  status: 'PENDING',
  value: 129.9,
  netValue: 124.9,
  billingType: 'PIX',
  externalReference: 'PED-uuid',
  invoiceUrl: 'https://www.asaas.com/i/080225913252',
  dateCreated: '2026-08-27',
};

/** `docs/gateway/asaas-api-reference.md` item 3 — `GET /v3/payments/{id}/pixQrCode` res. */
export const pixQrCodeFixture: AsaasPixQrCode = {
  encodedImage: 'iVBORw0KGgoAAAANSUhEUgAA...',
  payload: '00020101021226730014br.gov.bcb.pix...',
  expirationDate: '2026-08-28T23:59:59.000Z',
};

/**
 * Best-effort — `POST /v3/payments/{id}/refund` não tem exemplo literal na
 * referência; Dev Notes da Story 7.1 documentam que o retorno deve manter o
 * shape de `AsaasPayment` com status atualizado. Não verificado contra
 * sandbox real (ASAAS-1/ASAAS-2 pendentes).
 */
export const refundFixture: AsaasPayment = {
  id: 'pay_080225913252',
  object: 'payment',
  status: 'REFUNDED',
  value: 129.9,
  netValue: 124.9,
  billingType: 'PIX',
  externalReference: 'PED-uuid',
  dateCreated: '2026-08-27',
};

/**
 * Best-effort — `POST /v3/transfers` documentado como "reservado" em
 * `asaas-api-reference.md`, sem exemplo de payload. Shape inferido do
 * padrão público da API Asaas para transferência PIX externa. Não
 * verificado contra sandbox real nesta Story.
 */
export const transferFixture: AsaasTransfer = {
  id: 'tra_000000000001',
  status: 'PENDING',
  value: 100.5,
  effectiveDate: '2026-08-27',
};

/** Corpo de erro típico do Asaas (`{ errors: [{ code, description }] }`), usado nos testes de erro HTTP. */
export const asaasErrorBodyFixture = {
  errors: [
    {
      code: 'invalid_customer',
      description: 'O cliente informado não existe ou está inativo.',
    },
  ],
};
