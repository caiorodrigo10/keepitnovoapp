import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createSupportSupabase } from './support.supabase';

describe('SupportPort Supabase', () => {
  it('confirma reembolso pelo caso e mantém a referência e operação para idempotência', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const support = createSupportSupabase({ rpc } as unknown as SupabaseClient<Database>);
    await support.confirmarReembolso({ casoId: 'caso-1', referencia: 'estorno-gateway-1', operacaoId: 'op-1' });
    expect(rpc).toHaveBeenCalledWith('confirmar_reembolso', {
      p_caso_id: 'caso-1', p_referencia: 'estorno-gateway-1', p_operacao_id: 'op-1',
    });
  });

  it('devolve a solicitação autoritativa da RPC, inclusive em retry', async () => {
    const row = {
      id: 'caso-1', pedido_id: 'pedido-1', tipo: 'cancelamento', estado: 'aberta',
      motivo: 'Não poderei retirar', motivo_decisao: null, criado_em: '2026-10-01T00:00:00Z',
      encerrada_em: null, operacao_id: 'op-1',
    };
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    const support = createSupportSupabase({ rpc } as unknown as SupabaseClient<Database>);
    const input = { pedidoId: 'pedido-1', tipo: 'cancelamento' as const, motivo: 'Não poderei retirar', operacaoId: 'op-1' };
    const first = await support.abrir(input);
    const second = await support.abrir(input);
    expect(first).toEqual({ id: 'caso-1', pedidoId: 'pedido-1', tipo: 'cancelamento', estado: 'aberta', motivo: 'Não poderei retirar', motivoDecisao: null, criadoEm: '2026-10-01T00:00:00Z', encerradaEm: null, operacaoId: 'op-1' });
    expect(second).toEqual(first);
    expect(rpc).toHaveBeenCalledWith('abrir_solicitacao_pedido', { p_pedido_id: 'pedido-1', p_tipo: 'cancelamento', p_motivo: 'Não poderei retirar', p_operacao_id: 'op-1' });
  });
});
