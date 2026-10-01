type Receipt = { total_pago_reais: number };
type Delivered = { subtotal_produtos_reais: number; taxa_deslocamento_reais: number;
  taxa_keepit_reais: number; taxa_servico_comprador_reais: number };
type Ledger = { tipo: string; valor_centavos: number; status: string };
type GatewayFee = { tarifa_centavos: number; estado: string };

/** Valores independentes: charge/platform_fee auditam o pedido, mas não movimentam a dívida. */
export function calculateFinancialOverview(input: { receipts: Receipt[]; delivered: Delivered[];
  ledger: Ledger[]; gatewayFees: GatewayFee[] }) {
  const sumCents = (values: number[]) => values.reduce((sum, value) => sum + Math.round(value), 0);
  const received = sumCents(input.receipts.map((row) => row.total_pago_reais * 100));
  const revenue = sumCents(input.delivered.map((row) =>
    ((row.taxa_keepit_reais ?? 0) + (row.taxa_servico_comprador_reais ?? 0)) * 100));
  const gateway = sumCents(input.gatewayFees.filter((row) => row.estado === 'CREDITED')
    .map((row) => row.tarifa_centavos));
  const debt = sumCents(input.ledger.filter((row) => row.status === 'concluido' &&
    (row.tipo === 'merchant_credit' || row.tipo === 'payout')).map((row) => row.valor_centavos));
  const refunds = sumCents(input.ledger.filter((row) => row.tipo === 'refund' && row.status === 'concluido')
    .map((row) => Math.abs(row.valor_centavos)));
  return { recebidoClientesReais: received / 100, receitaKeepitReais: revenue / 100,
    despesaGatewayReais: gateway / 100, dividaLojistasReais: debt / 100, reembolsosReais: refunds / 100 };
}
