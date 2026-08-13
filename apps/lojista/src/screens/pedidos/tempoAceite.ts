import { businessConfig } from '@keepit/config';

/**
 * Story 6.8 (AC3, AC5) — texto de tempo decorrido/prazo de referência para
 * o aceite, DISPLAY-only (sem nenhuma ação de cancelamento associada — o
 * job real fica para a Story 6.10, `LATER`, fora deste bloco). Função pura
 * e testável: `agora` é injetável (default `new Date()`), nunca depende de
 * temporizador real — mesmo padrão que `statusMeta.ts#tempoRelativo` já usa
 * para "há X min", mas aqui comparando contra
 * `businessConfig.timeoutAceiteMin` (10 min) em vez de só o "quanto tempo
 * atrás".
 *
 * [IDS] Vive em arquivo PRÓPRIO (não em `statusMeta.ts`, onde a lógica
 * irmã — `getStatusBadge`/`tempoRelativo` — normalmente estaria) porque
 * `statusMeta.ts` importa `darkColors` de `@keepit/ui-tokens`, cujo `index`
 * reexporta `expo.ts` (`require('*.ttf')`, sintaxe do bundler Metro) — isso
 * quebra a coleta do Vitest (`SyntaxError` ao importar `.ttf`) para
 * qualquer teste que importe `statusMeta.ts`, mesmo indiretamente. Separar
 * a lógica pura sem dependência de `ui-tokens` é o que permite testá-la
 * (Dev Notes da Story 6.8: "função pura testável").
 */
export interface TempoAceiteStatus {
  /** Minutos completos desde `criado_em` (nunca negativo). */
  decorridoMin: number;
  /** Minutos restantes até o prazo de referência (pode ser negativo/zero). */
  restanteMin: number;
  /** `true` quando `decorridoMin >= timeoutMin` — só exibição, nada é cancelado automaticamente. */
  vencido: boolean;
}

export function tempoAceiteStatus(
  criadoEmIso: string,
  timeoutMin: number = businessConfig.timeoutAceiteMin,
  agora: Date = new Date(),
): TempoAceiteStatus {
  const diffMs = agora.getTime() - new Date(criadoEmIso).getTime();
  const decorridoMin = Math.max(0, Math.floor(diffMs / 60_000));
  const restanteMin = timeoutMin - decorridoMin;
  return { decorridoMin, restanteMin, vencido: restanteMin <= 0 };
}

/**
 * Texto honesto de exibição a partir de `tempoAceiteStatus` — nunca sugere
 * cancelamento automático (ex.: nada de "expira em"/"será cancelado"), só
 * informa o prazo de REFERÊNCIA para o lojista se organizar.
 */
export function tempoAceiteTexto(
  criadoEmIso: string,
  timeoutMin: number = businessConfig.timeoutAceiteMin,
  agora: Date = new Date(),
): string {
  const { restanteMin, vencido } = tempoAceiteStatus(criadoEmIso, timeoutMin, agora);
  if (vencido) {
    return `Prazo de referência de ${timeoutMin} min para aceite já passou`;
  }
  return `Prazo de referência para aceite: ${restanteMin} min`;
}
