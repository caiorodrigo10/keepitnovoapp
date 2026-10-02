import { describe, expect, it, vi } from 'vitest';

import { reconcilePaymentAndRefresh, resolveChargebackAndRefresh } from './useAdminOps';

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

describe('resolveChargebackAndRefresh', () => {
  it('relê as ocorrências depois da decisão administrativa', async () => {
    const resolveChargeback = vi.fn(async () => ({
      id: 'decisao-1', ocorrenciaId: 'ocorrencia-1', responsavelPrincipal: 'lojista' as const,
      motivo: 'Entrega não comprovada', referencia: 'protocolo-123',
      principalInformadoCentavos: 10_790, principalDebitadoCentavos: 9_500,
      taxaCentavos: 4_000, lancamentoId: 'ajuste-1', criadoEm: '2026-10-01T12:00:00Z',
    }));
    const refresh = vi.fn();
    const input = {
      ocorrenciaId: 'ocorrencia-1', responsavelPrincipal: 'lojista' as const,
      motivo: 'Entrega não comprovada', referencia: 'protocolo-123',
      principalCentavos: 10_790, operacaoId: 'operacao-1',
    };

    await expect(resolveChargebackAndRefresh(input, refresh, resolveChargeback))
      .resolves.toMatchObject({ id: 'decisao-1' });
    expect(refresh).toHaveBeenCalledOnce();
  });
});
