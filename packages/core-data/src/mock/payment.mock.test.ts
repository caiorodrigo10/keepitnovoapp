import { beforeEach, describe, expect, it } from 'vitest';

import type { PaymentPort } from '../ports/payment.port';
import { createMockDb, type MockDb } from './db';
import { createPaymentMock } from './payment.mock';

describe('payment.mock (contract) — Story 7.2', () => {
  let db: MockDb;
  let port: PaymentPort;

  beforeEach(() => {
    db = createMockDb();
    port = createPaymentMock(db);
  });

  it('gera uma cobrança PIX fake determinística a partir do pedidoId', async () => {
    const pedidoId = db.pedidos[0]!.id;

    const resultado = await port.criarCobrancaPix(pedidoId, { delayMs: 0 });

    expect(resultado.pedido_id).toBe(pedidoId);
    expect(resultado.asaas_payment_id).toMatch(/^pay_mock_/);
    expect(resultado.qr_code_pix).toMatch(/^MOCK-QR-/);
    expect(resultado.pix_copia_e_cola).toContain('FAKE');
  });

  it('é determinístico: duas instâncias de mock para o mesmo pedido geram o mesmo resultado', async () => {
    const pedidoId = db.pedidos[0]!.id;
    const outroDb = createMockDb();
    // Garante o mesmo pedido (mesmo id) nas duas fixtures clonadas.
    expect(outroDb.pedidos[0]!.id).toBe(pedidoId);
    const outraPort = createPaymentMock(outroDb);

    const resultado1 = await port.criarCobrancaPix(pedidoId, { delayMs: 0 });
    const resultado2 = await outraPort.criarCobrancaPix(pedidoId, { delayMs: 0 });

    expect(resultado1.asaas_payment_id).toBe(resultado2.asaas_payment_id);
    expect(resultado1.qr_code_pix).toBe(resultado2.qr_code_pix);
    expect(resultado1.pix_copia_e_cola).toBe(resultado2.pix_copia_e_cola);
  });

  it('idempotente: 2ª chamada para o mesmo pedidoId retorna exatamente o mesmo resultado (sem recriar)', async () => {
    const pedidoId = db.pedidos[0]!.id;

    const primeira = await port.criarCobrancaPix(pedidoId, { delayMs: 0 });
    const segunda = await port.criarCobrancaPix(pedidoId, { delayMs: 0 });

    expect(segunda).toEqual(primeira);
  });

  it('lança um erro descritivo [mock] para pedidoId desconhecido', async () => {
    await expect(port.criarCobrancaPix('pedido-inexistente', { delayMs: 0 })).rejects.toThrow(
      '[mock] Pedido não encontrado: pedido-inexistente',
    );
  });
});

it('tentativa demo não libera aceite nem PIN antes da confirmação explícita mock', async () => {
  const db = createMockDb(); const pedido = db.pedidos[0];
  pedido.status = 'aguardando_pagamento'; pedido.forma_pagamento = 'pix'; db.sessionClienteId = pedido.cliente_id;
  const payment = createPaymentMock(db);
  const tentativa = await payment.iniciarPix({ pedidoId: pedido.id, operacaoId: 'op-demo' });
  expect(tentativa.estado).toBe('pendente');
  expect(pedido.status).toBe('aguardando_pagamento');
  expect(await payment.consultar(pedido.id)).toEqual(tentativa);
  await expect(payment.iniciarPix({ pedidoId: pedido.id, operacaoId: 'outra-op' })).rejects.toThrow('TENTATIVA_EM_ANDAMENTO');
});

it('mock explícito só permite uma nova operação após encerramento da anterior', async () => {
  const db = createMockDb(); const pedido = db.pedidos[0];
  pedido.status = 'aguardando_pagamento'; pedido.forma_pagamento = 'pix'; db.sessionClienteId = pedido.cliente_id;
  const payment = createPaymentMock(db);
  const first = await payment.iniciarPix({ pedidoId: pedido.id, operacaoId: 'first' });
  const closeInput = { tentativaId: first.id, operacaoId: 'close' };
  expect((await payment.encerrarTentativa(closeInput)).estado).toBe('expirado');
  const second = await payment.iniciarPix({ pedidoId: pedido.id, operacaoId: 'second' });
  expect(second.id).not.toBe(first.id);
  expect((await payment.encerrarTentativa(closeInput)).id).toBe(first.id);
  expect((await payment.consultar(pedido.id))?.id).toBe(second.id);
});
