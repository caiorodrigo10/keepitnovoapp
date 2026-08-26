import { describe, expect, it } from 'vitest';

import type { PedidoStatus } from '@keepit/core-data';

import { isPedidoConcluido, isPedidoEmAndamento, PEDIDO_STATUS_LABEL, timelineStepIndex } from './pedidoStatus';

/**
 * Story 6.17 (AC3, AC5) — [GAP DE INFRA, já documentado nas Stories
 * 2.1/5.4/5.6/6.1/6.13] `apps/cliente` não tem harness de teste de
 * componente React (`MeusPedidos.tsx` não é renderizável em `.test.ts`
 * puro), então a cobertura desta Story fica na função PURA que a tela usa
 * para classificar as abas — `isPedidoEmAndamento`/`isPedidoConcluido`
 * (`pedidoStatus.ts`, já existente desde a Story 0.7). Nenhuma lógica nova
 * de cancelamento/reembolso é testada aqui (fora do escopo deste bloco,
 * ver `docs/stories/6.17.story.md` — "Reembolso e cancelamento —
 * fronteira").
 */

/** Os 15 valores exatos do CHECK constraint de `pedidos.status`. [Source: docs/architecture/03-data-models.md#5.1] */
const TODOS_OS_STATUS: PedidoStatus[] = [
  'aguardando_pagamento',
  'aguardando_aceite',
  'aceito',
  'em_preparo',
  'saindo_hub',
  'no_hub',
  'entregue',
  'cancelado',
  'cancelado_timeout',
  'cancelado_atraso',
  'cancelado_admin',
  'recusado',
  'nao_retirado',
  'nao_entregue_lojista',
  'estornado_chargeback',
];

const FLUXO_FELIZ_EM_ANDAMENTO: PedidoStatus[] = [
  'aguardando_aceite',
  'aceito',
  'em_preparo',
  'saindo_hub',
  'no_hub',
];

/** Estados terminais que este bloco (07) NÃO produz — Stories 6.11/6.18/6.19/6.20 + Épico 8, fora de escopo. */
const TERMINAIS_DE_EXCECAO: PedidoStatus[] = [
  'cancelado',
  'cancelado_timeout',
  'cancelado_atraso',
  'cancelado_admin',
  'recusado',
  'nao_retirado',
  'nao_entregue_lojista',
  'estornado_chargeback',
];

describe('isPedidoEmAndamento / isPedidoConcluido (Story 6.17, AC3, AC5)', () => {
  it('classifica o fluxo feliz completo (aguardando_aceite → aceito → em_preparo → saindo_hub → no_hub) como "Em andamento"', () => {
    for (const status of FLUXO_FELIZ_EM_ANDAMENTO) {
      expect(isPedidoEmAndamento(status)).toBe(true);
      expect(isPedidoConcluido(status)).toBe(false);
    }
  });

  it('migra para "Concluídos" ao chegar em entregue (AC5)', () => {
    expect(isPedidoEmAndamento('entregue')).toBe(false);
    expect(isPedidoConcluido('entregue')).toBe(true);
  });

  it('aguardando_pagamento (estado pré-aceite, mock) também é "Em andamento"', () => {
    expect(isPedidoEmAndamento('aguardando_pagamento')).toBe(true);
    expect(isPedidoConcluido('aguardando_pagamento')).toBe(false);
  });

  it('classifica todos os estados terminais de exceção (cancelamento/recusa/não-retirado) como "Concluídos" — AC3, mesmo sem esta Story produzir esses estados', () => {
    for (const status of TERMINAIS_DE_EXCECAO) {
      expect(isPedidoConcluido(status)).toBe(true);
      expect(isPedidoEmAndamento(status)).toBe(false);
    }
  });

  it('os 15 valores do enum real são exaustivamente cobertos — nenhum status "esquecido" fora da classificação', () => {
    for (const status of TODOS_OS_STATUS) {
      // Exatamente um dos dois é `true` — nunca os dois, nunca nenhum.
      expect(isPedidoEmAndamento(status)).toBe(!isPedidoConcluido(status));
    }
    expect(TODOS_OS_STATUS).toHaveLength(15);
  });

  it('PEDIDO_STATUS_LABEL tem rótulo em português para todos os 15 status — nenhum badge mostra o valor cru do enum', () => {
    for (const status of TODOS_OS_STATUS) {
      expect(PEDIDO_STATUS_LABEL[status]).toBeTruthy();
      expect(PEDIDO_STATUS_LABEL[status]).not.toBe(status);
    }
  });
});

describe('timelineStepIndex — timeline de 4 passos de "Seu pedido" ao longo do fluxo feliz', () => {
  it('avança monotonicamente ao longo do fluxo feliz completo', () => {
    const indices = FLUXO_FELIZ_EM_ANDAMENTO.map(timelineStepIndex).concat(timelineStepIndex('entregue'));
    for (let i = 1; i < indices.length; i += 1) {
      expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
    }
    expect(indices[indices.length - 1]).toBe(3); // "Entregue" é sempre o último passo.
  });
});
