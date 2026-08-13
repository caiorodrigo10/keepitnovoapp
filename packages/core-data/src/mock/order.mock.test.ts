import { businessConfig } from '@keepit/config';
import { beforeEach, describe, expect, it } from 'vitest';

import type { OrderPort } from '../ports/order.port';
import { PinBloqueadoError, PinIncorretoError } from '../ports/order.port';
import { createMockDb, type MockDb } from './db';
import { createOrderMock } from './order.mock';

describe('order.mock (contract)', () => {
  let db: MockDb;
  let port: OrderPort;

  beforeEach(() => {
    db = createMockDb();
    port = createOrderMock(db);
  });

  it('create persiste o snapshot de itens e os totais de cabeçalho recebidos (Story 6.6, AC1/AC7 — sem recalcular a partir do catálogo)', async () => {
    const subtotal = 29.8; // 2x produto-dipirona a R$ 14,90 (mesmo valor do catálogo, calculado por quem chama)
    const taxaKeepit = (subtotal * businessConfig.taxaKeepitPercent) / 100;
    const taxaDeslocamento = 5;
    const taxaServico = businessConfig.taxaServicoCompradorReais;
    const total = subtotal + taxaDeslocamento + taxaServico;

    const pedido = await port.create(
      {
        cliente_id: 'cliente-ana',
        estabelecimento_id: 'estab-farmacia-vida',
        hub_id: 'hub-centro',
        itens: [
          { produto_id: 'produto-dipirona', nome_snapshot: 'Dipirona Monoidratada 500mg', preco_unitario_reais: 14.9, quantidade: 2 },
        ],
        forma_pagamento: 'pix',
        subtotal_produtos_reais: subtotal,
        taxa_deslocamento_reais: taxaDeslocamento,
        taxa_keepit_reais: taxaKeepit,
        taxa_servico_comprador_reais: taxaServico,
        total_pago_reais: total,
        nf_solicitada: false,
      },
      { delayMs: 1 },
    );

    expect(pedido.subtotal_produtos_reais).toBeCloseTo(29.8, 2);
    expect(pedido.taxa_keepit_reais).toBeCloseTo((29.8 * businessConfig.taxaKeepitPercent) / 100, 2);
    expect(pedido.taxa_deslocamento_reais).toBeCloseTo(taxaDeslocamento, 2);
    // Story 6.16 (AC1, AC3): campo que faltava no read model — volta a
    // aparecer no `Pedido` retornado por `create`, como o resto dos totais.
    expect(pedido.taxa_servico_comprador_reais).toBeCloseTo(taxaServico, 2);
    expect(pedido.total_pago_reais).toBeCloseTo(total, 2);
    // AC6: status inicial alinhado ao piloto real (pagamento simulado em dev).
    expect(pedido.status).toBe('aguardando_aceite');
    expect(pedido.pin_texto).toMatch(/^\d{4}$/);
    expect(pedido.itens).toHaveLength(1);
    expect(pedido.itens[0]).toMatchObject({
      nome_snapshot: 'Dipirona Monoidratada 500mg',
      preco_unitario_reais: 14.9,
      quantidade: 2,
      subtotal_reais: 29.8,
    });
  });

  it('create rejeita cliente bloqueado (Story 8.5 AC4) — paridade mock↔real, nenhum pedido é criado', async () => {
    db.clientes.find((c) => c.id === 'cliente-ana')!.bloqueado = true;

    const pedidosAntes = db.pedidos.length;

    await expect(
      port.create(
        {
          cliente_id: 'cliente-ana',
          estabelecimento_id: 'estab-farmacia-vida',
          hub_id: 'hub-centro',
          itens: [{ produto_id: 'produto-dipirona', nome_snapshot: 'Dipirona', preco_unitario_reais: 14.9, quantidade: 1 }],
          forma_pagamento: 'pix',
          subtotal_produtos_reais: 14.9,
          taxa_deslocamento_reais: 5,
          taxa_keepit_reais: 1.5,
          taxa_servico_comprador_reais: businessConfig.taxaServicoCompradorReais,
          total_pago_reais: 14.9 + 5 + businessConfig.taxaServicoCompradorReais,
          nf_solicitada: false,
        },
        { delayMs: 1 },
      ),
    ).rejects.toThrow(/bloqueado/i);

    // Nenhum efeito colateral — nenhum pedido novo criado para o cliente bloqueado.
    expect(db.pedidos.length).toBe(pedidosAntes);
  });

  it('listMine resolves with only the pedidos of the given cliente', async () => {
    const pedidos = await port.listMine('cliente-ana', { delayMs: 1 });
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos.every((p) => p.cliente_id === 'cliente-ana')).toBe(true);
  });

  it('confirmPin blocks after businessConfig.pinTentativasMax wrong attempts (Story 6.15, AC3, AC8) — rejects with PinIncorretoError then PinBloqueadoError, mesmas classes do adapter Supabase', async () => {
    const pedidoId = 'pedido-2049';

    for (let i = 0; i < businessConfig.pinTentativasMax - 1; i += 1) {
      const promise = port.confirmPin(pedidoId, '0000', { delayMs: 1 });
      await expect(promise).rejects.toBeInstanceOf(PinIncorretoError);
      await promise.catch((err: PinIncorretoError) => {
        expect(err.tentativasRestantes).toBe(businessConfig.pinTentativasMax - 1 - i);
      });
    }

    // 5º erro: bloqueia e zera tentativas_pin (mesmo comportamento da RPC real).
    const quintoErro = port.confirmPin(pedidoId, '0000', { delayMs: 1 });
    await expect(quintoErro).rejects.toBeInstanceOf(PinBloqueadoError);

    // Tentativa (mesmo com PIN correto) durante o bloqueio ativo continua bloqueada,
    // sem consumir/incrementar tentativa.
    await expect(port.confirmPin(pedidoId, '7734', { delayMs: 1 })).rejects.toBeInstanceOf(PinBloqueadoError);
  });

  it('confirmPin with the correct PIN transitions status to "entregue" and zeroes tentativas_pin/pin_bloqueado_ate', async () => {
    const pedido = await port.confirmPin('pedido-2049', '7734', { delayMs: 1 });
    expect(pedido.status).toBe('entregue');
    expect(pedido.entregue_em).not.toBeNull();
    expect(pedido.tentativas_pin).toBe(0);
    expect(pedido.pin_bloqueado_ate).toBeNull();
  });

  it('is genuinely asynchronous — does not resolve on the same tick', () => {
    let resolved = false;
    const promise = port.listMine('cliente-ana', { delayMs: 0 }).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    return promise;
  });

  it('forceError rejects the Promise', async () => {
    await expect(port.listMine('cliente-ana', { forceError: true, delayMs: 1 })).rejects.toThrow();
  });

  it('forceEmpty resolves with an empty array', async () => {
    await expect(port.listMine('cliente-ana', { forceEmpty: true, delayMs: 1 })).resolves.toEqual([]);
  });

  // -------------------------------------------------------------------
  // Lado lojista (Story 1.10, Task 1)
  // -------------------------------------------------------------------

  it('getById resolves a single pedido, or null when not found', async () => {
    const pedido = await port.getById('pedido-2048', { delayMs: 1 });
    expect(pedido?.id).toBe('pedido-2048');

    const inexistente = await port.getById('pedido-inexistente', { delayMs: 1 });
    expect(inexistente).toBeNull();
  });

  it('listByEstabelecimento resolves only pedidos of the given estabelecimento', async () => {
    const pedidos = await port.listByEstabelecimento('estab-farmacia-vida', { delayMs: 1 });
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos.every((p) => p.estabelecimento_id === 'estab-farmacia-vida')).toBe(true);
  });

  it('accept transitions aguardando_aceite -> aceito, persisting tempo_estimado_min/aceito_em (Story 6.9)', async () => {
    const pedido = await port.accept('pedido-2049', 25, { delayMs: 1 });
    expect(pedido.status).toBe('aceito');
    expect(pedido.tempo_estimado_min).toBe(25);
    expect(pedido.aceito_em).not.toBeNull();
  });

  it('accept rejects double-acceptance — pedido já em "aceito" (Story 6.9, paridade com a RPC ESTADO_INVALIDO)', async () => {
    await expect(port.accept('pedido-ops-3005', 25, { delayMs: 1 })).rejects.toThrow(/não permitida/i);
  });

  it('markReadyForHub transitions aceito/em_preparo -> saindo_hub and rejects otherwise', async () => {
    const pedido = await port.markReadyForHub('lj-pedido-2048', { delayMs: 1 });
    expect(pedido.status).toBe('saindo_hub');
    expect(pedido.saiu_hub_em).not.toBeNull();

    await expect(port.markReadyForHub('lj-pedido-2049', { delayMs: 1 })).rejects.toThrow(/não permitida/i);
  });

  it('markArrivedAtHub transitions saindo_hub -> no_hub, filling lojista_chegou_em', async () => {
    await port.markReadyForHub('lj-pedido-2048', { delayMs: 1 });
    const pedido = await port.markArrivedAtHub('lj-pedido-2048', { delayMs: 1 });
    expect(pedido.status).toBe('no_hub');
    expect(pedido.lojista_chegou_em).not.toBeNull();
  });

  it('markCustomerNoShow transitions no_hub -> nao_retirado and populates a reembolso (AC9: 20% cliente)', async () => {
    const pedido = await port.markCustomerNoShow('lj-pedido-2045', 'Cliente não veio', { delayMs: 1 });
    expect(pedido.status).toBe('nao_retirado');
    expect(pedido.motivo_nao_retirado).toBe('Cliente não veio');

    const reembolso = db.reembolsos.find((r) => r.pedido_id === 'lj-pedido-2045');
    expect(reembolso).toBeDefined();
    expect(reembolso?.motivo).toBe('nao_retirado_cliente');
    expect(reembolso?.valor_a_estornar_reais).toBeCloseTo(pedido.total_pago_reais * 0.2, 2);
  });

  // -------------------------------------------------------------------
  // Lado cliente (Story 1.10, Task 2)
  // -------------------------------------------------------------------

  it('advanceStatus moves through em_preparo -> saindo_hub -> no_hub, rejecting invalid adjacency', async () => {
    const pedidoId = 'lj-pedido-2048'; // status inicial: em_preparo (fixture)
    const emPreparo = db.pedidos.find((p) => p.id === pedidoId);
    expect(emPreparo?.status).toBe('em_preparo');

    const saindo = await port.advanceStatus(pedidoId, 'saindo_hub', { delayMs: 1 });
    expect(saindo.status).toBe('saindo_hub');
    expect(saindo.saiu_hub_em).not.toBeNull();

    const noHub = await port.advanceStatus(pedidoId, 'no_hub', { delayMs: 1 });
    expect(noHub.status).toBe('no_hub');

    await expect(port.advanceStatus(pedidoId, 'em_preparo', { delayMs: 1 })).rejects.toThrow(/não permitida/i);
  });

  it('markClienteChegou fills cliente_chegou_em only from no_hub', async () => {
    const pedido = await port.markClienteChegou('lj-pedido-2045', { delayMs: 1 });
    expect(pedido.cliente_chegou_em).not.toBeNull();

    await expect(port.markClienteChegou('lj-pedido-2049', { delayMs: 1 })).rejects.toThrow(/não permitida/i);
  });

  it('refuse populates a reembolso (motivo: recusa_lojista, 100% cliente)', async () => {
    const pedido = await port.refuse('lj-pedido-2049', 'Sem estoque', { delayMs: 1 });
    const reembolso = db.reembolsos.find((r) => r.pedido_id === pedido.id);
    expect(reembolso?.motivo).toBe('recusa_lojista');
    expect(reembolso?.valor_a_estornar_reais).toBeCloseTo(pedido.total_pago_reais, 2);
  });

  it('cancel derives the refund % from the pedido status (AC9: pre-aceite 100%, pós-aceite 90/10) and blocks after saindo_hub', async () => {
    const preAceite = await port.cancel('lj-pedido-2049', 'Mudei de ideia', { delayMs: 1 });
    const reembolsoPre = db.reembolsos.find((r) => r.pedido_id === preAceite.id);
    expect(reembolsoPre?.motivo).toBe('cancelamento_cliente_pre_aceite');

    const posAceite = await port.cancel('lj-pedido-2048', 'Mudei de ideia', { delayMs: 1 });
    const reembolsoPos = db.reembolsos.find((r) => r.pedido_id === posAceite.id);
    expect(reembolsoPos?.motivo).toBe('cancelamento_cliente_pos_aceite');
    expect(reembolsoPos?.valor_a_estornar_reais).toBeCloseTo(posAceite.total_pago_reais * 0.9, 2);

    await expect(port.cancel('lj-pedido-2045', 'Tarde demais', { delayMs: 1 })).rejects.toThrow(/não permitida/i);
  });
});
