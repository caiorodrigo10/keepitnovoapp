/**
 * Story 6.7.1 (AC1, AC2, AC3, AC8) — [IDS] CREATE. Nenhum util de simulação
 * de pagamento existia em `apps/cliente` antes desta story.
 *
 * **Constantes de UX — NÃO regra de negócio.** Os delays abaixo só existem
 * para o demo dar um feedback visual crível entre "Pagar" e a tela do PIN
 * (`ModalConfirmarPin`, Story 6.7). O delay REAL virá do webhook Asaas
 * `PAYMENT_RECEIVED` (Bloco 08-PIX/Épico 7, deferido) — quando esse webhook
 * existir, ele chama `OrderPort.confirmarPagamento` diretamente, sem
 * nenhum redesenho de UI.
 *
 * **`startPagamentoSimulado`** é o motor de estado PURO (sem importar
 * `react`/`react-native`) reaproveitado por `usePagamentoSimulado.ts`
 * (`apps/cliente/src/hooks`) — mesmo padrão de `pedidoPolling.ts`/
 * `usePedidosMine.ts` (Story 6.13): `apps/cliente` não tem
 * `@testing-library/react-native` (`vitest` roda em ambiente `node`), então
 * a lógica de timer/estado fica aqui, testável com fake timers e
 * dependências injetadas (`pagamentoSimulado.test.ts`); o hook só conecta
 * este módulo a `setTimeout`/`clearTimeout` reais do runtime e a
 * `client.order.confirmarPagamento`.
 */

import type { Pedido } from '@keepit/core-data';

/** ~5s — tempo simulado de "Aguardando pagamento" no PIX (AC1, AC2). NÃO regra de negócio. */
export const PIX_AUTO_CONFIRM_DELAY_MS = 5000;

/** ~2s — tempo simulado de "Processando pagamento…" no cartão (AC3). NÃO regra de negócio. */
export const CARTAO_AUTO_CONFIRM_DELAY_MS = 2000;

/** Pausa curta entre o texto "confirmado"/"aprovado" e a navegação para o PIN — só UX, NÃO regra de negócio. */
export const CONFIRMADO_PAUSE_MS = 900;

/**
 * Hash determinístico simples (FNV-1a truncado) — só para variar o código
 * FAKE por pedido sem precisar de nenhuma lib de criptografia (não é um
 * requisito de segurança, é só para o código copia-e-cola/QR parecerem
 * únicos por pedido no demo).
 */
function hashPedidoId(pedidoId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < pedidoId.length; i += 1) {
    hash ^= pedidoId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, '0');
}

/**
 * Código PIX "copia e cola" — 100% FAKE — NUNCA usar em produção, NUNCA
 * enviado a nenhum provedor/PSP real (Asaas ou qualquer outro). Determinístico
 * a partir de `pedido.id` (mesmo pedido → mesmo código, para o QR e o texto
 * copia-e-cola baterem entre si e entre re-renders). Não segue o formato
 * EMV/BR Code oficial do Banco Central — é só uma string plausível o
 * suficiente para o QR renderizar algo, nunca uma cobrança real.
 * [Source: decisão do orquestrador, Story 6.7.1 — "QR REAL do payload FAKE"]
 */
export function pixCopiaCola(pedido: Pedido): string {
  const hash = hashPedidoId(pedido.id);
  const total = pedido.total_pago_reais.toFixed(2).replace('.', '');
  return `00020126FAKE-KEEPIT-DEMO-${hash}-NAO-E-PIX-REAL5303986540${total}5802BR5913KEEPIT DEMO6009RIO DE JANEIRO6304FAKE`;
}

export type PagamentoSimuladoStatus = 'aguardando' | 'confirmado' | 'erro';

export interface PagamentoSimuladoDeps {
  /** Injeta `setTimeout` real (produção) ou fake de teste (`vi.useFakeTimers()`). */
  setTimeout: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  /** Injeta `clearTimeout` real (produção) ou fake de teste. */
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
  /** `() => client.order.confirmarPagamento(pedidoId)` — injetado para o módulo não depender de `@keepit/core-data`. */
  confirmarPagamento: () => Promise<unknown>;
  /** `PIX_AUTO_CONFIRM_DELAY_MS` ou `CARTAO_AUTO_CONFIRM_DELAY_MS`, conforme a tela chamadora. */
  delayMs: number;
  /** `CONFIRMADO_PAUSE_MS` por padrão — só a tela de teste sobrepõe. */
  pauseMs: number;
  /** Chamado a cada mudança de estado (`aguardando` → `confirmado` | `erro`). */
  onStatusChange: (status: PagamentoSimuladoStatus) => void;
  /** Chamado UMA VEZ, após `pauseMs` seguindo uma confirmação com sucesso — sinal para a tela navegar ao PIN. */
  onComplete: () => void;
}

export interface PagamentoSimuladoController {
  /** Reagenda o fluxo do zero (estado "aguardando" → novo timer) — usado pelo botão "Tentar novamente" (AC8). */
  retry: () => void;
  /** Cancela QUALQUER timer pendente — chamar no cleanup do `useEffect` (AC2/AC3: sair da tela cancela a confirmação). */
  stop: () => void;
}

/**
 * Motor de estado do pagamento simulado (AC1-AC3, AC8): agenda a chamada de
 * `confirmarPagamento` após `delayMs`; em caso de sucesso, emite
 * `onStatusChange('confirmado')` e, após `pauseMs`, `onComplete()` (sinal
 * para navegar ao PIN); em caso de erro, emite `onStatusChange('erro')` —
 * NUNCA um loading infinito, NUNCA `onComplete()` sem confirmação real (AC8).
 * `stop()` cancela qualquer timer pendente de forma síncrona — chamado no
 * cleanup do `useEffect` do hook, garante que sair da tela antes da
 * confirmação nunca dispara uma chamada "fantasma" nem `onComplete()` depois
 * que o componente já desmontou.
 */
export function startPagamentoSimulado(deps: PagamentoSimuladoDeps): PagamentoSimuladoController {
  let confirmTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let pauseTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function clearTimers(): void {
    if (confirmTimeoutId !== null) {
      deps.clearTimeout(confirmTimeoutId);
      confirmTimeoutId = null;
    }
    if (pauseTimeoutId !== null) {
      deps.clearTimeout(pauseTimeoutId);
      pauseTimeoutId = null;
    }
  }

  function schedule(): void {
    clearTimers();
    confirmTimeoutId = deps.setTimeout(() => {
      confirmTimeoutId = null;
      deps
        .confirmarPagamento()
        .then(() => {
          if (stopped) return;
          deps.onStatusChange('confirmado');
          pauseTimeoutId = deps.setTimeout(() => {
            pauseTimeoutId = null;
            if (!stopped) {
              deps.onComplete();
            }
          }, deps.pauseMs);
        })
        .catch(() => {
          if (!stopped) {
            deps.onStatusChange('erro');
          }
        });
    }, deps.delayMs);
  }

  schedule();

  return {
    retry: () => {
      if (stopped) return;
      deps.onStatusChange('aguardando');
      schedule();
    },
    stop: () => {
      stopped = true;
      clearTimers();
    },
  };
}
