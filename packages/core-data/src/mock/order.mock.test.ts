import { businessConfig } from '@keepit/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreatePedidoInput, OrderPort } from '../ports/order.port';
import { OrderTransitionError, PinBloqueadoError, PinIncorretoError } from '../ports/order.port';
import { createDefaultQaScenarioState } from './cliente-state';
import { ClienteMockStateStore } from './cliente-state-store';
import { createMockDb, type MockDb } from './db';
import { createOrderMock } from './order.mock';

const validInput: CreatePedidoInput = {
  cliente_id: 'cliente-ana',
  estabelecimento_id: 'estab-farmacia-vida',
  hub_id: 'hub-centro',
  itens: [
    {
      produto_id: 'produto-dipirona',
      nome_snapshot: 'Dipirona Monoidratada 500mg',
      preco_unitario_reais: 14.9,
      quantidade: 2,
    },
  ],
  forma_pagamento: 'pix',
  subtotal_produtos_reais: 29.8,
  taxa_deslocamento_reais: 5,
  taxa_keepit_reais: (29.8 * businessConfig.taxaKeepitPercent) / 100,
  taxa_servico_comprador_reais: businessConfig.taxaServicoCompradorReais,
  total_pago_reais: 29.8 + 5 + businessConfig.taxaServicoCompradorReais,
  nf_solicitada: false,
};

function qaComAtrasosDeUmSegundo() {
  const qa = createDefaultQaScenarioState();
  qa.autoProgressOrders = true;
  qa.orderProgressionDelaysMs = {
    aceito: 1_000,
    em_preparo: 1_000,
    saindo_hub: 1_000,
    no_hub: 1_000,
  };
  return qa;
}

async function settleMock<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe('order.mock (contract)', () => {
  let db: MockDb;
  let port: OrderPort;

  beforeEach(() => {
    db = createMockDb();
    port = createOrderMock(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('create persiste o snapshot de itens e os totais de cabeçalho recebidos (Story 6.6, AC1/AC7 — sem recalcular a partir do catálogo)', async () => {
    const pedido = await port.create(validInput, { delayMs: 1 });

    expect(pedido.subtotal_produtos_reais).toBeCloseTo(29.8, 2);
    expect(pedido.taxa_keepit_reais).toBeCloseTo((29.8 * businessConfig.taxaKeepitPercent) / 100, 2);
    expect(pedido.taxa_deslocamento_reais).toBeCloseTo(5, 2);
    // Story 6.16 (AC1, AC3): campo que faltava no read model — volta a
    // aparecer no `Pedido` retornado por `create`, como o resto dos totais.
    expect(pedido.taxa_servico_comprador_reais).toBeCloseTo(businessConfig.taxaServicoCompradorReais, 2);
    expect(pedido.total_pago_reais).toBeCloseTo(
      29.8 + 5 + businessConfig.taxaServicoCompradorReais,
      2,
    );
    // Story 6.7.1 (AC5): status inicial volta a ser `aguardando_pagamento` —
    // a transição para `aguardando_aceite` passa a ser feita por
    // `confirmarPagamento`, chamada automaticamente pela UI (ver testes abaixo).
    expect(pedido.status).toBe('aguardando_pagamento');
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

  it('notifica persistência somente depois de uma mutação de pedido bem-sucedida', async () => {
    let mutationCount = 0;
    db.onClienteMutation = () => {
      mutationCount += 1;
    };

    await expect(port.confirmarPagamento('pedido-2049', { delayMs: 1 })).rejects.toThrow();
    expect(mutationCount).toBe(0);

    await port.create(
      {
        cliente_id: 'cliente-ana',
        estabelecimento_id: 'estab-farmacia-vida',
        hub_id: 'hub-centro',
        itens: [
          {
            produto_id: 'produto-dipirona',
            nome_snapshot: 'Dipirona Monoidratada 500mg',
            preco_unitario_reais: 14.9,
            quantidade: 2,
          },
        ],
        forma_pagamento: 'pix',
        subtotal_produtos_reais: 29.8,
        taxa_deslocamento_reais: 5,
        taxa_keepit_reais: 3.58,
        taxa_servico_comprador_reais: 1.99,
        total_pago_reais: 40.37,
        nf_solicitada: false,
      },
      { delayMs: 1 },
    );
    expect(mutationCount).toBe(1);
  });

  it('confirmarPagamento transitions aguardando_pagamento -> aguardando_aceite, without touching aceito_em (Story 6.7.1, AC1-AC4)', async () => {
    const criado = await port.create(
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
    );
    expect(criado.status).toBe('aguardando_pagamento');

    const confirmado = await port.confirmarPagamento(criado.id, { delayMs: 1 });
    expect(confirmado.status).toBe('aguardando_aceite');
    // `aceito_em` continua exclusivo de `accept` (Story 6.9) — confirmarPagamento
    // só confirma o PAGAMENTO, não o aceite da loja.
    expect(confirmado.aceito_em).toBeNull();
  });

  it('agenda após pagamento, reconcilia leituras e emite cada transição uma vez', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-05T10:00:00.000Z');
    db.clienteQaState = qaComAtrasosDeUmSegundo();
    const event = vi.fn();
    port.subscribeChanges!(event);

    const created = await settleMock(port.create(validInput, { delayMs: 0 }));
    await settleMock(port.confirmarPagamento(created.id, { delayMs: 0 }));

    expect(db.clienteOrderAutomation[created.id]).toEqual({
      enteredStatusAt: '2026-09-05T10:00:00.000Z',
    });

    vi.setSystemTime('2026-09-05T10:00:05.000Z');
    const current = (await settleMock(port.listMine('cliente-ana', { delayMs: 0 }))).find(
      (pedido) => pedido.id === created.id,
    );
    expect(current?.status).toBe('no_hub');
    expect(event.mock.calls.filter(([value]) => value.reason === 'auto-progress')).toEqual(
      Array.from({ length: 4 }, () => [
        { clienteId: 'cliente-ana', pedidoId: created.id, reason: 'auto-progress' },
      ]),
    );
    expect(event.mock.calls.filter(([value]) => value.reason === 'mutation')).toHaveLength(2);

    const sameCurrent = (await settleMock(port.listMine('cliente-ana', { delayMs: 0 }))).find(
      (pedido) => pedido.id === created.id,
    );
    expect(sameCurrent?.status).toBe('no_hub');
    expect(event.mock.calls.filter(([value]) => value.reason === 'auto-progress')).toHaveLength(4);
  });

  it('não agenda antes do pagamento e mantém o pedido aguardando pagamento', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-05T10:00:00.000Z');
    db.clienteQaState = qaComAtrasosDeUmSegundo();

    const created = await settleMock(port.create(validInput, { delayMs: 0 }));
    vi.setSystemTime('2026-09-05T10:00:05.000Z');
    const current = await settleMock(port.getById(created.id, { delayMs: 0 }));

    expect(current?.status).toBe('aguardando_pagamento');
    expect(db.clienteOrderAutomation[created.id]).toBeUndefined();
  });

  it('reconcilia a progressão automática também em getById', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-05T10:00:00.000Z');
    db.clienteQaState = qaComAtrasosDeUmSegundo();
    const created = await settleMock(port.create(validInput, { delayMs: 0 }));
    await settleMock(port.confirmarPagamento(created.id, { delayMs: 0 }));

    vi.setSystemTime('2026-09-05T10:00:05.000Z');
    const current = await settleMock(port.getById(created.id, { delayMs: 0 }));

    expect(current?.status).toBe('no_hub');
  });

  it('deixa de notificar um listener após unsubscribe', async () => {
    vi.useFakeTimers();
    const event = vi.fn();
    const unsubscribe = port.subscribeChanges!(event);
    await settleMock(port.create(validInput, { delayMs: 0 }));
    expect(event).toHaveBeenCalledTimes(1);

    unsubscribe();
    await settleMock(port.create(validInput, { delayMs: 0 }));

    expect(event).toHaveBeenCalledTimes(1);
  });

  it('emite reset para cada conta removida do domínio Cliente', async () => {
    const stateStore = new ClienteMockStateStore(db, {
      async getItem() {
        return null;
      },
      async setItem() {},
      async removeItem() {},
    });
    await stateStore.hydrate();
    const event = vi.fn();
    port.subscribeChanges!(event);

    await stateStore.reset();

    expect(event).toHaveBeenCalledWith({ clienteId: 'cliente-ana', reason: 'reset' });
  });

  it.each([
    ['pausada', false, qaComAtrasosDeUmSegundo().orderProgressionDelaysMs],
    ['sem configuração de atrasos', true, null],
  ] as const)('não progride quando a automação está %s', async (_label, autoProgressOrders, delays) => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-05T10:00:00.000Z');
    db.clienteQaState = qaComAtrasosDeUmSegundo();
    const created = await settleMock(port.create(validInput, { delayMs: 0 }));
    await settleMock(port.confirmarPagamento(created.id, { delayMs: 0 }));

    db.clienteQaState.autoProgressOrders = autoProgressOrders;
    db.clienteQaState.orderProgressionDelaysMs = delays;
    vi.setSystemTime('2026-09-05T10:00:05.000Z');

    const current = await settleMock(port.getById(created.id, { delayMs: 0 }));
    expect(current?.status).toBe('aguardando_aceite');
  });

  it.each(['cancel', 'refuse', 'deliver'] as const)(
    'remove a âncora após %s terminal',
    async (terminalAction) => {
      vi.useFakeTimers();
      vi.setSystemTime('2026-09-05T10:00:00.000Z');
      db.clienteQaState = qaComAtrasosDeUmSegundo();
      const created = await settleMock(port.create(validInput, { delayMs: 0 }));
      await settleMock(port.confirmarPagamento(created.id, { delayMs: 0 }));

      if (terminalAction === 'cancel') {
        await settleMock(port.cancel(created.id, 'Mudei de ideia', { delayMs: 0 }));
      } else if (terminalAction === 'refuse') {
        await settleMock(port.refuse(created.id, 'Sem estoque', { delayMs: 0 }));
      } else {
        await settleMock(port.confirmPin(created.id, created.pin_texto, { delayMs: 0 }));
      }

      expect(db.clienteOrderAutomation[created.id]).toBeUndefined();
    },
  );

  it('reancora uma transição manual no relógio QA', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-05T10:00:00.000Z');
    db.clienteQaState = qaComAtrasosDeUmSegundo();
    db.clienteQaState.clockOffsetMs = 10_000;
    const created = await settleMock(port.create(validInput, { delayMs: 0 }));
    await settleMock(port.confirmarPagamento(created.id, { delayMs: 0 }));

    vi.setSystemTime('2026-09-05T10:00:00.500Z');
    await settleMock(port.accept(created.id, 25, { delayMs: 0 }));
    vi.setSystemTime('2026-09-05T10:00:01.250Z');

    const current = await settleMock(port.getById(created.id, { delayMs: 0 }));
    expect(current?.status).toBe('aceito');
    expect(db.clienteOrderAutomation[created.id]).toEqual({
      enteredStatusAt: '2026-09-05T10:00:10.500Z',
    });
  });

  it('confirmarPagamento rejects with OrderTransitionError from any other status (Story 6.7.1, AC4)', async () => {
    // Fixture `pedido-2049` já nasce em `aguardando_aceite` (Story 0.10/6.6 fixtures).
    await expect(port.confirmarPagamento('pedido-2049', { delayMs: 1 })).rejects.toThrow(/não permitida/i);
    await expect(port.confirmarPagamento('pedido-2049', { delayMs: 1 })).rejects.toBeInstanceOf(OrderTransitionError);
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

  it('confirmPin incorreto rejeita, mas notifica persistência porque incrementa tentativas', async () => {
    let mutationCount = 0;
    db.onClienteMutation = () => {
      mutationCount += 1;
    };

    await expect(port.confirmPin('pedido-2049', '0000', { delayMs: 1 })).rejects.toBeInstanceOf(PinIncorretoError);

    expect(db.pedidos.find((pedido) => pedido.id === 'pedido-2049')?.tentativas_pin).toBe(1);
    expect(mutationCount).toBe(1);
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

  it('reportLojistaNaoVeio (Story 6.20, AC2/AC4): sucesso quando no_hub + cliente_chegou_em vencido, popula refund 100% + falha', async () => {
    // lj-pedido-2045: fixture status 'no_hub', tempo_estimado_min 15. Marca
    // chegada "no passado" (além de max(15, esperaLojistaMaxMin)=20min) para
    // exercitar o reforço de tempo sem depender de timers reais.
    const pedido = db.pedidos.find((p) => p.id === 'lj-pedido-2045')!;
    pedido.cliente_chegou_em = new Date(Date.now() - 25 * 60_000).toISOString();

    const atualizado = await port.reportLojistaNaoVeio('lj-pedido-2045', { delayMs: 1 });
    expect(atualizado.status).toBe('nao_entregue_lojista');

    const reembolso = db.reembolsos.find((r) => r.pedido_id === atualizado.id);
    expect(reembolso?.motivo).toBe('nao_entregue_lojista');
    expect(reembolso?.valor_a_estornar_reais).toBeCloseTo(atualizado.total_pago_reais, 2);

    const falha = db.falhas.find((f) => f.pedido_id === atualizado.id);
    expect(falha?.tipo).toBe('lojista_nao_apareceu');
    expect(falha?.estabelecimento_id).toBe(atualizado.estabelecimento_id);
  });

  it('reportLojistaNaoVeio rejects when the pedido is not in no_hub', async () => {
    // lj-pedido-2048: fixture status 'em_preparo'.
    await expect(port.reportLojistaNaoVeio('lj-pedido-2048', { delayMs: 1 })).rejects.toThrow(/não permitida/i);
  });

  it('reportLojistaNaoVeio rejects when cliente_chegou_em is not set (ESTADO_INVALIDO)', async () => {
    // lj-pedido-2045: fixture status 'no_hub', cliente_chegou_em null.
    await expect(port.reportLojistaNaoVeio('lj-pedido-2045', { delayMs: 1 })).rejects.toThrow(/ESTADO_INVALIDO/);
  });

  it('reportLojistaNaoVeio rejects before the minimum waiting time (TEMPO_MINIMO_NAO_ATINGIDO — server-side reinforcement)', async () => {
    const pedido = db.pedidos.find((p) => p.id === 'lj-pedido-2045')!;
    pedido.cliente_chegou_em = new Date().toISOString(); // acabou de chegar

    await expect(port.reportLojistaNaoVeio('lj-pedido-2045', { delayMs: 1 })).rejects.toThrow(
      /TEMPO_MINIMO_NAO_ATINGIDO/,
    );
  });

  it('refuse populates a reembolso (motivo: recusa_lojista, 100% cliente)', async () => {
    const pedido = await port.refuse('lj-pedido-2049', 'Sem estoque', { delayMs: 1 });
    const reembolso = db.reembolsos.find((r) => r.pedido_id === pedido.id);
    expect(reembolso?.motivo).toBe('recusa_lojista');
    expect(reembolso?.valor_a_estornar_reais).toBeCloseTo(pedido.total_pago_reais, 2);
  });

  it('refuse rejects when the pedido is no longer aguardando_aceite (Story 6.11, AC6 — parity with the real RPC)', async () => {
    // lj-pedido-2048: fixture status 'em_preparo' (já aceito).
    await expect(port.refuse('lj-pedido-2048', 'Sem estoque', { delayMs: 1 })).rejects.toThrow(/não permitida/i);
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

  it('cancelPedidoAtraso (Story 6.21, AC2/AC3): sucesso quando 2x tempo_estimado_min vencido, popula refund 100% + falha atraso_grave', async () => {
    // lj-pedido-2048: fixture status 'em_preparo', tempo_estimado_min 20 →
    // limiar de 2x = 40min. Empurra aceito_em para além disso.
    const pedido = db.pedidos.find((p) => p.id === 'lj-pedido-2048')!;
    pedido.aceito_em = new Date(Date.now() - 45 * 60_000).toISOString();

    const atualizado = await port.cancelPedidoAtraso('lj-pedido-2048', { delayMs: 1 });
    expect(atualizado.status).toBe('cancelado_atraso');
    expect(atualizado.cancelado_em).not.toBeNull();

    const reembolso = db.reembolsos.find((r) => r.pedido_id === atualizado.id);
    expect(reembolso?.motivo).toBe('cancelamento_atraso');
    expect(reembolso?.valor_a_estornar_reais).toBeCloseTo(atualizado.total_pago_reais, 2);

    const falha = db.falhas.find((f) => f.pedido_id === atualizado.id);
    expect(falha?.tipo).toBe('atraso_grave');
    expect(falha?.estabelecimento_id).toBe(atualizado.estabelecimento_id);
  });

  it('cancelPedidoAtraso rejects when the pedido is not in aceito/em_preparo', async () => {
    // lj-pedido-2045: fixture status 'no_hub'.
    await expect(port.cancelPedidoAtraso('lj-pedido-2045', { delayMs: 1 })).rejects.toThrow(/não permitida/i);
  });

  it('cancelPedidoAtraso rejects before 2x tempo_estimado_min (ATRASO_NAO_CONFIRMADO — server-side reinforcement)', async () => {
    // lj-pedido-2048: aceito_em minutosAtras(4) na fixture, tempo_estimado_min
    // 20 → limiar de 40min ainda não vencido.
    await expect(port.cancelPedidoAtraso('lj-pedido-2048', { delayMs: 1 })).rejects.toThrow(
      /ATRASO_NAO_CONFIRMADO/,
    );
  });
});
