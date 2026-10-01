import { describe, expect, it, vi } from 'vitest';
import type { DataClient, SupportCase } from '@keepit/core-data';
import { decideSupportCase } from './decideSupportCase';

describe('decideSupportCase', () => {
  it('relê o pedido depois da decisão para atualizar o estado apresentado', async () => {
    const caso: SupportCase = { id: 'caso-1', pedidoId: 'pedido-1', tipo: 'cancelamento', estado: 'aprovada', motivo: 'Desisti', motivoDecisao: 'Procede', criadoEm: '2026-10-01T00:00:00Z', encerradaEm: '2026-10-01T00:01:00Z', operacaoId: 'op-1' };
    const decidir = vi.fn().mockResolvedValue(caso);
    const getById = vi.fn().mockResolvedValue({ id: 'pedido-1', status: 'cancelado_admin' });
    const client = { support: { decidir }, order: { getById } } as unknown as Pick<DataClient, 'support' | 'order'>;
    const result = await decideSupportCase(client, { casoId: caso.id, aprovar: true, motivo: 'Procede', operacaoId: 'op-2' });
    expect(getById).toHaveBeenCalledWith('pedido-1');
    expect(getById.mock.invocationCallOrder[0]).toBeGreaterThan(decidir.mock.invocationCallOrder[0]);
    expect(result.pedido?.status).toBe('cancelado_admin');
  });
});
