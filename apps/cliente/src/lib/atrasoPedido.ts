import type { Pedido } from '@keepit/core-data';

/**
 * Story 6.21 (AC1, AC4) — [IDS] CREATE, mesmo padrão de módulo PURO já usado
 * por `pedidoPolling.ts`/`lojistaNaoVeio.ts` (Story 6.20, mesmo Bloco): sem
 * importar `react`/`react-native`, testável isoladamente com `Date` fixo
 * (`apps/cliente` não tem harness de teste de componente/hook — mesmo gap de
 * infra já documentado em Stories anteriores).
 *
 * Condição do AC1/AC2 do épico (adaptada — ver `docs/stories/6.21.story.md`
 * Classificação): `NOW() > aceito_em + 2 * tempo_estimado_min`, avaliada a
 * cada poll (`businessConfig.pedidoPollingIntervalSeg`, Story 6.13, já
 * existente). A MESMA condição é reforçada server-side pela RPC
 * `cancelar_pedido_atraso` — este helper é só a UI decidindo quando MOSTRAR o
 * prompt, nunca a única linha de defesa.
 */
export function isPedidoAtrasado(
  pedido: Pick<Pedido, 'status' | 'aceito_em' | 'tempo_estimado_min'>,
  now: Date = new Date(),
): boolean {
  if (pedido.status !== 'aceito' && pedido.status !== 'em_preparo') {
    return false;
  }
  if (!pedido.aceito_em || !pedido.tempo_estimado_min) {
    return false;
  }

  const limiteMs = new Date(pedido.aceito_em).getTime() + 2 * pedido.tempo_estimado_min * 60_000;
  return now.getTime() > limiteMs;
}
