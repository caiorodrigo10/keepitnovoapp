import { businessConfig } from '@keepit/config';
import type { Pedido } from '@keepit/core-data';

/**
 * Story 6.20 (AC1) — [IDS] CREATE, mesmo padrão de módulo PURO já usado por
 * `pedidoPolling.ts`/`cancelamentoPolicy.ts`: sem importar `react`/
 * `react-native`, testável isoladamente com `Date` fixo (`apps/cliente` não
 * tem harness de teste de componente/hook — mesmo gap de infra já
 * documentado nas Stories 2.1/5.4/5.6/6.1/6.13/6.17).
 *
 * Condição do AC1: o botão "Lojista não veio" fica visível quando `NOW() >
 * cliente_chegou_em + max(tempo_estimado_min, businessConfig.esperaLojistaMaxMin)`.
 * A MESMA condição é reforçada server-side pela RPC `reportar_lojista_nao_veio`
 * (Story 6.20, AC2) — este helper é só a UI decidindo quando MOSTRAR o botão,
 * nunca a única linha de defesa.
 */
export function podeReportarLojistaNaoVeio(
  pedido: Pick<Pedido, 'status' | 'cliente_chegou_em' | 'tempo_estimado_min'>,
  now: Date = new Date(),
): boolean {
  if (pedido.status !== 'no_hub') {
    return false;
  }
  if (!pedido.cliente_chegou_em) {
    return false;
  }

  const esperaMin = Math.max(pedido.tempo_estimado_min ?? 0, businessConfig.esperaLojistaMaxMin);
  const limiteMs = new Date(pedido.cliente_chegou_em).getTime() + esperaMin * 60_000;
  return now.getTime() > limiteMs;
}
