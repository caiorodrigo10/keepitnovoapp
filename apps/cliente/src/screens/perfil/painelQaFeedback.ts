import type { ResetDemoScenarioResult } from '../../lib/resetDemoScenario';

export interface QaResetFeedback {
  title: string;
  message?: string;
}

const FAILURE_LABELS: Record<
  Extract<ResetDemoScenarioResult, { status: 'degraded' }>['failures'][number],
  string
> = {
  'scenario-persistence': 'persistência do cenário',
  'cart-persistence': 'persistência do carrinho',
  'cart-live-state': 'carrinho em memória',
};

function formatReadableList(items: string[]): string {
  if (items.length < 2) {
    return items[0] ?? 'camada não identificada';
  }
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

export function getQaResetFeedback(result: ResetDemoScenarioResult): QaResetFeedback | null {
  if (result.status === 'reset') {
    return { title: 'Cenário restaurado' };
  }
  if (result.status === 'degraded') {
    const failures = result.failures.map((failure) => FAILURE_LABELS[failure]);
    return {
      title: 'Cenário limpo em memória, mas uma ou mais camadas não foram persistidas',
      message: `Camadas afetadas: ${formatReadableList(failures)}.`,
    };
  }
  if (result.status === 'unavailable') {
    return {
      title: 'Reset indisponível',
      message: 'Reset disponível somente no datasource mock.',
    };
  }
  return null;
}
