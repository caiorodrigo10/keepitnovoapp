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

  it('persiste o alias da segunda operação para retry depois da decisão', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'em_preparo')!;
    db.sessionClienteId = pedido.cliente_id;
    const support = createSupportMock(db);
    const first = await support.abrir({ pedidoId: pedido.id, tipo: 'cancelamento', motivo: 'Primeira', operacaoId: 'op-alias-1' });
    expect((await support.abrir({ pedidoId: pedido.id, tipo: 'cancelamento', motivo: 'Retry diferente', operacaoId: 'op-alias-2' })).id).toBe(first.id);
    db.sessionClienteId = null;
    await support.decidir({ casoId: first.id, aprovar: false, motivo: 'Pode retirar', operacaoId: 'op-decide' });
    db.sessionClienteId = pedido.cliente_id;
    const retry = await support.abrir({ pedidoId: pedido.id, tipo: 'cancelamento', motivo: 'Retry', operacaoId: 'op-alias-2' });
    expect(retry.id).toBe(first.id);
    expect(retry.estado).toBe('negada');
    await expect(support.abrir({ pedidoId: pedido.id, tipo: 'atraso', motivo: 'Reuso', operacaoId: 'op-alias-2' })).rejects.toThrow('OPERACAO_ID_EM_USO');
    expect(db.solicitacoesPedido).toHaveLength(1);
  });

  it('cliente não declara ausência própria e pós-entrega exige pedido entregue', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'no_hub')!;
    db.sessionClienteId = pedido.cliente_id;
    const support = createSupportMock(db);
    await expect(support.abrir({ pedidoId: pedido.id, tipo: 'cliente_ausente', motivo: 'Ausente', operacaoId: 'op-author' })).rejects.toThrow('ACESSO_NEGADO');
    await expect(support.abrir({ pedidoId: pedido.id, tipo: 'pos_entrega', motivo: 'Falta', operacaoId: 'op-status' })).rejects.toThrow('ESTADO_INVALIDO');
  });

  it('fecha os casos relacionados com histórico vinculado à decisão principal', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'em_preparo')!;
    db.sessionClienteId = pedido.cliente_id;
    const support = createSupportMock(db);
    const cancelamento = await support.abrir({ pedidoId: pedido.id, tipo: 'cancelamento', motivo: 'Desisti', operacaoId: 'op-close-1' });
    pedido.aceito_em = new Date(Date.now() - 3_600_000).toISOString();
    pedido.tempo_estimado_min = 10;
    const atraso = await support.abrir({ pedidoId: pedido.id, tipo: 'atraso', motivo: 'Demora', operacaoId: 'op-close-2' });
    db.sessionClienteId = null;
    await support.decidir({ casoId: cancelamento.id, aprovar: true, motivo: 'Procede', operacaoId: 'op-close-3' });
    expect(atraso.estado).toBe('negada');
    const principal = db.decisoesSolicitacao.find((item) => item.casoId === cancelamento.id);
    const relacionada = db.decisoesSolicitacao.find((item) => item.casoId === atraso.id);
    expect(relacionada?.decisaoOrigemId).toBe(principal?.id);
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
