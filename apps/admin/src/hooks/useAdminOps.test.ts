import { describe, expect, it, vi } from 'vitest';

import { reconcilePaymentAndRefresh } from './useAdminOps';

describe('reconcilePaymentAndRefresh', () => {
  it('relê a fila persistida após uma reconciliação concluída', async () => {
    const reconcilePayment = vi.fn(async () => ({ resultado: 'recebido', pedidoId: 'pedido-1' }));
    const refresh = vi.fn();

    await expect(reconcilePaymentAndRefresh('tentativa-1', refresh, reconcilePayment)).resolves.toMatchObject({ resultado: 'recebido' });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('relê a fila persistida após resposta ambígua ou perdida', async () => {
    const reconcilePayment = vi.fn(async () => {
      throw new Error('COBRANCA_AMBIGUA');
    });
    const refresh = vi.fn();

    let rejected = false;
    try {
      await reconcilePaymentAndRefresh('tentativa-1', refresh, reconcilePayment);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
