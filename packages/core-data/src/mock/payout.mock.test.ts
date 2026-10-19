import { describe, expect, it } from 'vitest';
import { createMockDb } from './db';
import { createPayoutMock } from './payout.mock';
import { createWalletMock } from './wallet.mock';

describe('PayoutPort mock', () => {
  it('prepara uma vez o crédito de pedido entregue por PIN e confirma sem dupla baixa', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'no_hub')!;
    db.pedidos = [pedido];
    pedido.status = 'entregue';
    pedido.entregue_em = '2026-09-28T03:00:00.000Z';
    const payout = createPayoutMock(db);
    const first = await payout.preparar({ semanaInicio: '2026-09-28', operacaoId: 'op-preparar-1' });
    const repeat = await payout.preparar({ semanaInicio: '2026-09-28', operacaoId: 'op-preparar-1' });
    const lote = first.find((item) => item.estabelecimentoId === pedido.estabelecimento_id)!;
    expect(lote).toMatchObject({ estado: 'pendente', previstoPara: '2026-10-09' });
    expect(lote.chavePix).toBeTruthy();
    expect(repeat.find((item) => item.id === lote.id)).toBeDefined();
    expect(lote.valorCentavos).toBe(Math.round((pedido.subtotal_produtos_reais - pedido.taxa_keepit_reais + pedido.taxa_deslocamento_reais) * 100));
    const paid = await payout.confirmar({ repasseId: lote.id, referencia: 'pix-001', comprovanteIdentificador: 'banco:arquivo-1', operacaoId: 'op-confirmar-1' });
    db.sessionLojistaUserId = db.estabelecimentosCadastrados.find((item) => item.id === pedido.estabelecimento_id)?.donoUserId ?? null;
    expect((await payout.listar()).find((item) => item.id === lote.id)).toMatchObject({ referencia: null, chavePix: null });
    await expect(payout.consultarComprovante(lote.id)).rejects.toThrow('ACESSO_NEGADO');
    db.sessionLojistaUserId = null;
    expect(await payout.consultarComprovante(lote.id)).toMatchObject({ referencia: 'pix-001', comprovanteIdentificador: 'banco:arquivo-1' });
    expect((await payout.confirmar({ repasseId: lote.id, referencia: 'pix-001', comprovanteIdentificador: 'banco:arquivo-1', operacaoId: 'op-confirmar-1' })).id).toBe(paid.id);
    await expect(payout.confirmar({ repasseId: lote.id, referencia: 'pix-001', comprovanteIdentificador: 'banco:arquivo-1', operacaoId: 'op-diferente' })).rejects.toThrow('OPERACAO_ID_EM_USO');
    await expect(payout.confirmar({ repasseId: lote.id, referencia: 'pix-diferente', comprovanteIdentificador: 'banco:arquivo-1', operacaoId: 'op-confirmar-1' })).rejects.toThrow('REFERENCIA_DIVERGENTE');
    await expect(payout.confirmar({ repasseId: lote.id, referencia: 'pix-001', comprovanteIdentificador: 'banco:outro-arquivo', operacaoId: 'op-confirmar-1' })).rejects.toThrow('COMPROVANTE_DIVERGENTE');
    expect(db.repasses.filter((item) => item.id === lote.id)).toHaveLength(1);
    expect(paid.estado).toBe('pago');
    db.pedidos.push({ ...pedido, id: 'pedido-seguinte', entregue_em: '2026-10-05T03:00:00.000Z' });
    const next = (await payout.preparar({ semanaInicio: '2026-10-05', operacaoId: 'op-preparar-2' }))[0]!;
    await expect(payout.confirmar({ repasseId: next.id, referencia: 'pix-001', comprovanteIdentificador: 'banco:arquivo-1', operacaoId: 'op-confirmar-2' })).rejects.toThrow('REFERENCIA_EM_USO');
  });

  it('não inclui pedido sem PIN e impede ações de lojista', async () => {
    const db = createMockDb();
    const payout = createPayoutMock(db);
    db.sessionLojistaUserId = db.estabelecimentosCadastrados[0]!.donoUserId;
    await expect(payout.preparar({ semanaInicio: '2026-09-28', operacaoId: 'op-merchant' })).rejects.toThrow('ACESSO_NEGADO');
  });

  it('carrega ajuste parcial sem criar PIX negativo nem consumir duas vezes', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'no_hub')!;
    db.pedidos = [pedido];
    pedido.status = 'entregue'; pedido.entregue_em = '2026-09-28T03:00:00.000Z';
    const credit = Math.round((pedido.subtotal_produtos_reais - pedido.taxa_keepit_reais + pedido.taxa_deslocamento_reais) * 100);
    db.ajustesReembolso.push({ reembolsoId: 'refund-1', pedidoId: pedido.id, valorCentavos: -(credit + 500) });
    const payout = createPayoutMock(db);
    const first = (await payout.preparar({ semanaInicio: '2026-09-28', operacaoId: 'op-1' }))[0]!;
    expect(first).toMatchObject({ estado: 'compensado', valorCentavos: 0 });
    await expect(payout.confirmar({ repasseId: first.id, referencia: 'pix-1', comprovanteIdentificador: 'banco:arquivo-1', operacaoId: 'op-2' })).rejects.toThrow('ESTADO_INVALIDO');
    const next = { ...pedido, id: 'pedido-next', entregue_em: '2026-10-05T03:00:00.000Z' };
    db.pedidos.push(next);
    const second = (await payout.preparar({ semanaInicio: '2026-10-05', operacaoId: 'op-3' }))[0]!;
    expect(second.valorCentavos).toBe(credit - 500);
    expect(db.repasseItens.filter((item) => item.fonteId === 'refund-1' && !item.liberado).reduce((sum, item) => sum - item.valorCentavos, 0)).toBe(credit + 500);
  });

  it('mantém reembolso de custo Keepit fora da carteira e carrega ajuste lojista posterior ao PIX', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'no_hub')!;
    db.pedidos = [pedido]; pedido.status = 'entregue'; pedido.entregue_em = '2026-09-28T03:00:00.000Z';
    db.saques = [];
    const payout = createPayoutMock(db);
    const wallet = createWalletMock(db);
    const initial = await wallet.getBalance(pedido.estabelecimento_id);
    db.reembolsos.push({ id: 'refund-keepit', pedido_id: pedido.id, motivo: 'cancelamento_admin',
      valor_a_estornar_reais: 3, valor_ao_lojista_reais: 0, forma_pagamento: 'pix',
      status: 'estornado', criado_em: '2026-09-29T00:00:00Z', responsavel: 'keepit' });
    expect(await wallet.getBalance(pedido.estabelecimento_id)).toEqual(initial);
    const first = (await payout.preparar({ semanaInicio: '2026-09-28', operacaoId: 'prep-refund-1' }))[0]!;
    await payout.confirmar({ repasseId: first.id, referencia: 'pix-refund-1', comprovanteIdentificador: 'banco:arquivo-1', operacaoId: 'pay-refund-1' });
    db.ajustesReembolso.push({ reembolsoId: 'refund-merchant', pedidoId: pedido.id, valorCentavos: -300 });
    expect((await wallet.getBalance(pedido.estabelecimento_id)).saldo_disponivel_reais).toBe(-3);
    db.pedidos.push({ ...pedido, id: 'pedido-futuro', entregue_em: '2026-10-05T03:00:00.000Z' });
    const next = (await payout.preparar({ semanaInicio: '2026-10-05', operacaoId: 'prep-refund-2' }))[0]!;
    expect(next.valorCentavos).toBe(first.valorCentavos - 300);
    expect((await payout.listar()).find((item) => item.id === next.id)?.itens?.some((item) => item.valorCentavos < 0)).toBe(true);
  });

  it('não prepara PIX sem dados bancários verificados da loja', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'no_hub')!;
    db.pedidos = [{ ...pedido, id: 'sem-pix', estabelecimento_id: 'loja-sem-pix', status: 'entregue', entregue_em: '2026-09-28T03:00:00.000Z' }];
    await expect(createPayoutMock(db).preparar({ semanaInicio: '2026-09-28', operacaoId: 'op-sem-pix' })).rejects.toThrow('CHAVE_PIX_OBRIGATORIA');
  });

  it('resolve análise incerta só após evidência sem PIX e não reutiliza operação de análise', async () => {
    const db = createMockDb();
    const pedido = db.pedidos.find((item) => item.status === 'no_hub')!;
    db.pedidos = [pedido]; pedido.status = 'entregue'; pedido.entregue_em = '2026-09-28T03:00:00.000Z';
    const payout = createPayoutMock(db);
    const first = (await payout.preparar({ semanaInicio: '2026-09-28', operacaoId: 'prep-1' }))[0]!;
    await payout.marcarEmAnalise({ repasseId: first.id, motivo: 'PIX incerto', operacaoId: 'analise-1' });
    await expect(payout.invalidar({ repasseId: first.id, motivo: 'Incerto', operacaoId: 'inv-1' })).rejects.toThrow('ESTADO_INVALIDO');
    await expect(payout.resolverSemPix({ repasseId: first.id, motivo: 'Conciliado', evidencia: ' ', operacaoId: 'resolver-1' })).rejects.toThrow('EVIDENCIA_SEM_PIX_OBRIGATORIA');
    const resolved = await payout.resolverSemPix({ repasseId: first.id, motivo: 'Conciliado', evidencia: 'Extrato sem transferência', operacaoId: 'resolver-1' });
    expect(resolved.estado).toBe('invalidado');
    expect(db.repasseItens.every((item) => item.liberado)).toBe(true);
    expect(db.repasseEventos).toContainEqual(expect.objectContaining({ repasseId: first.id, tipo: 'resolucao_sem_pix', evidencia: 'Extrato sem transferência' }));
    const next = (await payout.preparar({ semanaInicio: '2026-09-28', operacaoId: 'prep-2' }))[0]!;
    await expect(payout.marcarEmAnalise({ repasseId: next.id, motivo: 'Outro lote', operacaoId: 'analise-1' })).rejects.toThrow('OPERACAO_ID_EM_USO');
  });
});
