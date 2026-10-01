import { describe, expect, it } from 'vitest';
import { createMockDb } from './db';
import { createSupportMock } from './support.mock';

describe('SupportPort mock', () => {
  it('deduplica a abertura pela operacaoId e preserva preparo após aceite', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'em_preparo');
    expect(pedido).toBeDefined();
    db.sessionClienteId = pedido!.cliente_id;
    const support = createSupportMock(db);
    const input = { pedidoId: pedido!.id, tipo: 'cancelamento' as const, motivo: 'Não poderei retirar', operacaoId: 'op-1' };
    const first = await support.abrir(input);
    const second = await support.abrir(input);
    expect(first.estado).toBe('aberta');
    expect(second.id).toBe(first.id);
    expect(pedido!.status).toBe('em_preparo');
    expect(db.solicitacoesPedido).toHaveLength(1);
  });

  it('cancela antes do aceite e só registra reembolso integral se pago', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'aguardando_aceite');
    expect(pedido).toBeDefined();
    db.sessionClienteId = pedido!.cliente_id;
    const caseRecord = await createSupportMock(db).abrir({ pedidoId: pedido!.id, tipo: 'cancelamento', motivo: 'Desisti', operacaoId: 'op-2' });
    expect(caseRecord.estado).toBe('aprovada');
    expect(pedido!.status).toBe('cancelado');
    expect(db.reembolsos.filter((item) => item.pedido_id === pedido!.id).at(-1)?.valor_a_estornar_reais).toBe(pedido!.total_pago_reais);
  });

  it('rejeita caso de outro cliente e decisão pelo lojista', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'em_preparo');
    expect(pedido).toBeDefined();
    db.sessionClienteId = 'outro-cliente';
    const support = createSupportMock(db);
    await expect(support.abrir({ pedidoId: pedido!.id, tipo: 'cancelamento', motivo: 'Teste', operacaoId: 'op-3' })).rejects.toThrow('ACESSO_NEGADO');
    db.sessionClienteId = pedido!.cliente_id;
    const opened = await support.abrir({ pedidoId: pedido!.id, tipo: 'cancelamento', motivo: 'Teste', operacaoId: 'op-4' });
    await expect(support.decidir({ casoId: opened.id, aprovar: true, motivo: 'Aceito', operacaoId: 'op-5' })).rejects.toThrow('ACESSO_NEGADO');
  });

  it('não aceita ausência de lojista sem check-in e tempo mínimo', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'no_hub')!;
    db.sessionClienteId = pedido.cliente_id;
    const support = createSupportMock(db);
    await expect(support.abrir({ pedidoId: pedido.id, tipo: 'lojista_ausente', motivo: 'Não veio', operacaoId: 'op-early' })).rejects.toThrow('TEMPO_MINIMO_NAO_ATINGIDO');
    expect(db.solicitacoesPedido).toHaveLength(0);
  });

  it('não aceita atraso antes de duas vezes o prazo estimado', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'em_preparo')!;
    db.sessionClienteId = pedido.cliente_id;
    await expect(createSupportMock(db).abrir({ pedidoId: pedido.id, tipo: 'atraso', motivo: 'Atrasado', operacaoId: 'op-early' })).rejects.toThrow('ATRASO_NAO_CONFIRMADO');
    expect(db.solicitacoesPedido).toHaveLength(0);
  });

  it('exige valor e responsável válidos para aprovar pós-entrega', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'entregue')!;
    db.sessionClienteId = pedido.cliente_id;
    const support = createSupportMock(db);
    const caso = await support.abrir({ pedidoId: pedido.id, tipo: 'pos_entrega', motivo: 'Produto faltando', operacaoId: 'op-pos-1' });
    db.sessionClienteId = null;
    await expect(support.decidir({ casoId: caso.id, aprovar: true, motivo: 'Procede', operacaoId: 'op-pos-2' })).rejects.toThrow('VALOR_RESPONSABILIDADE_OBRIGATORIOS');
    expect(caso.estado).toBe('aberta');
  });
});
