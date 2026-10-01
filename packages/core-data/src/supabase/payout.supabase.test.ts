import { describe, expect, it, vi } from 'vitest';
import { createPayoutSupabase } from './payout.supabase';

const row = { id: 'repasse-1', estabelecimento_id: 'loja-1', semana_inicio: '2026-09-28',
  previsto_para: '2026-10-09', valor_centavos: 1234, estado: 'pendente',
  destinatario_nome: 'Loja', destinatario_responsavel: 'Dona', chave_pix: 'pix', chave_pix_tipo: 'email',
  referencia: null, preparado_em: '2026-10-01T00:00:00Z', confirmado_em: null };

describe('PayoutPort Supabase', () => {
  it('combina lotes materializados e previsões sem expor chave PIX na previsão', async () => {
    const from = vi.fn((name: string) => ({ select: () => ({
      eq: () => ({ eq: async () => ({ data: [{ id: 'credito-2', estabelecimento_id: 'loja-1', semana_inicio: '2026-10-05', valor_centavos: 700, pedido_id: 'pedido-2', pedidos: { numero: 43, taxa_keepit_reais: 0.7 } }], error: null }) }),
      order: async () => ({ data: name === 'repasses' ? [row] : name === 'repasse_itens' ? [{ repasse_id: 'repasse-1', lancamento_id: 'credito-1', valor_centavos: 1234, liberado_em: null, lancamentos_financeiros: { pedido_id: 'pedido-1', pedidos: { numero: 42, taxa_keepit_reais: 1.4 } } }] : [{ id: 'prev-1', estabelecimento_id: 'loja-1', semana_inicio: '2026-10-05', previsto_para: '2026-10-16', valor_centavos: 500 }], error: null }),
    }) }));
    const payout = createPayoutSupabase({ from } as never);
    const result = await payout.listar();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ estado: 'previsto', valorCentavos: 500, chavePix: null,
      itens: [{ pedidoId: 'pedido-2', numeroPedido: 43, comissaoCentavos: 70, valorCentavos: 700 },
        { valorCentavos: -200, pedidoId: null }] });
    expect(result[1]).toMatchObject({ estado: 'pendente', chavePix: 'pix', itens: [{ lancamentoId: 'credito-1', pedidoId: 'pedido-1', valorCentavos: 1234, numeroPedido: 42, comissaoCentavos: 140 }] });
  });

  it('encaminha chave de idempotência em preparação e confirmação', async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === 'preparar_repasses_semanais' ? [row] : { ...row, estado: 'pago', referencia: 'pix-1' }, error: null }));
    const payout = createPayoutSupabase({ rpc } as never);
    expect((await payout.preparar({ semanaInicio: '2026-09-28', operacaoId: 'op-1' }))[0]?.id).toBe('repasse-1');
    expect(rpc).toHaveBeenCalledWith('preparar_repasses_semanais', { p_semana_inicio: '2026-09-28', p_operacao_id: 'op-1' });
    expect((await payout.confirmar({ repasseId: 'repasse-1', referencia: 'pix-1', operacaoId: 'op-2' })).estado).toBe('pago');
    expect(rpc).toHaveBeenCalledWith('confirmar_repasse', { p_repasse_id: 'repasse-1', p_referencia: 'pix-1', p_operacao_id: 'op-2' });
    await payout.resolverSemPix({ repasseId: 'repasse-1', motivo: 'Conciliação', evidencia: 'Extrato sem PIX', operacaoId: 'op-3' });
    expect(rpc).toHaveBeenCalledWith('resolver_repasse_sem_pix', { p_repasse_id: 'repasse-1', p_motivo: 'Conciliação', p_evidencia_sem_pix: 'Extrato sem PIX', p_operacao_id: 'op-3' });
  });
});
