import { describe, expect, it } from 'vitest';
import { calculateFinancialOverview } from './financialOverview';

describe('conciliação financeira do dashboard', () => {
  it('separa receita Keepit, custo gateway, dívida e reembolso sem somar charge ao lojista', () => {
    const result = calculateFinancialOverview({
      receipts: [{ total_pago_reais: 107.9 }],
      delivered: [{ subtotal_produtos_reais: 100, taxa_deslocamento_reais: 5,
        taxa_keepit_reais: 10, taxa_servico_comprador_reais: 2.9 }],
      ledger: [
        { tipo: 'charge', valor_centavos: 10790, status: 'concluido' },
        { tipo: 'platform_fee', valor_centavos: -1000, status: 'concluido' },
        { tipo: 'merchant_credit', valor_centavos: 9500, status: 'concluido' },
        { tipo: 'merchant_credit', valor_centavos: -2000, status: 'concluido' },
        { tipo: 'payout', valor_centavos: -3000, status: 'concluido' },
        { tipo: 'refund', valor_centavos: -2000, status: 'concluido' },
      ],
      gatewayFees: [{ tarifa_centavos: 350, estado: 'CREDITED' }],
    });
    expect(result).toEqual({ recebidoClientesReais: 107.9, receitaKeepitReais: 12.9,
      despesaGatewayReais: 3.5, dividaLojistasReais: 45, reembolsosReais: 20 });
  });

  it('reembolso de custo Keepit não altera dívida; ajuste lojista preserva saldo negativo futuro', () => {
    const base = { receipts: [], delivered: [], gatewayFees: [] };
    expect(calculateFinancialOverview({ ...base, ledger: [
      { tipo: 'merchant_credit', valor_centavos: 1000, status: 'concluido' },
      { tipo: 'payout', valor_centavos: -1000, status: 'concluido' },
      { tipo: 'refund', valor_centavos: -300, status: 'concluido' },
    ] }).dividaLojistasReais).toBe(0);
    expect(calculateFinancialOverview({ ...base, ledger: [
      { tipo: 'merchant_credit', valor_centavos: 1000, status: 'concluido' },
      { tipo: 'payout', valor_centavos: -1000, status: 'concluido' },
      { tipo: 'merchant_credit', valor_centavos: -300, status: 'concluido' },
    ] }).dividaLojistasReais).toBe(-3);
  });
});
