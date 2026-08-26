import type { EstabelecimentoFalha, EstabelecimentoFalhaTipo } from '../ports/admin.port';
import type { Pedido } from '../ports/order.port';
import { generateMockId } from './async-helpers';
import type { MockDb } from './db';

/**
 * Story 6.20 (AC2, AC4) — [IDS] CREATE, mesmo padrão de
 * `refund-helpers.ts#registrarReembolso`: helper centralizado para inserir em
 * `db.falhas`, reutilizável pelos produtores não-admin desta Story e da Story
 * 6.21 (mesmo Bloco) — antes disso, `db.falhas` só era LIDO (`admin.mock.ts
 * #lojistaQualityView`), nunca escrito por um fluxo real de cliente/lojista.
 */
export function registrarFalha(
  db: MockDb,
  pedido: Pick<Pedido, 'id' | 'estabelecimento_id' | 'numero'>,
  tipo: EstabelecimentoFalhaTipo,
  detalhes: string,
): EstabelecimentoFalha {
  const falha: EstabelecimentoFalha = {
    id: generateMockId('falha'),
    estabelecimento_id: pedido.estabelecimento_id,
    pedido_id: pedido.id,
    tipo,
    detalhes,
    criado_em: new Date().toISOString(),
  };
  db.falhas.push(falha);
  return falha;
}
