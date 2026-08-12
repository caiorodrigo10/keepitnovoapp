import type { Estabelecimento, Hub } from '@keepit/core-data';
import { businessConfig } from '@keepit/config';

/**
 * Validações síncronas client-side do checkout — Story 6.3 (validação
 * temporal, AC1-AC4) e Story 6.4 (validação de ticket mínimo, AC1-AC4).
 * Overlay SIMPLE do piloto para 6.3: comparação síncrona no momento do
 * "Pagar", sem a Edge Function `validar-pedido` do texto literal do épico
 * (modelo-alvo pós-piloto) — 6.4 sempre foi síncrona, sem automação a
 * "rebaixar". Funções puras, testáveis sem harness de componente React,
 * mesmo padrão de `apps/cliente/src/lib/checkoutTotals.ts` (Story 6.2) e de
 * `deriveLojaEstado`/`validarHorariosSemanais`
 * (`packages/core-data/src/ports/store.port.ts`, `now` injetável).
 */

function paraMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Story 6.3 (AC1, AC4). `agora + estabelecimento.tempo_medio_entrega_min +
 * businessConfig.margemHorarioPedidoMin <= hora_fecha do hub HOJE`.
 *
 * FAIL-CLOSED (AC1): sem `estabelecimento`/`hub` ainda carregados, sem
 * horário cadastrado para hoje, `aberto = false` ou `hora_fecha` ausente —
 * a validação sempre retorna `false`, nunca "passa por omissão" de dado
 * ausente. Reaproveita a MESMA leitura de "horário de hoje" já usada por
 * `EscolhaRetirada.tsx#formatAbertoAte`
 * (`hub.horarios.find((item) => item.dia_semana === hoje)`), evitando duas
 * implementações divergentes da mesma regra.
 *
 * `now` é injetável (default `new Date()`) para ser testável sem depender
 * do relógio real.
 */
export function podeFinalizarNoHorario(
  estabelecimento: Pick<Estabelecimento, 'tempo_medio_entrega_min'> | null | undefined,
  hub: Pick<Hub, 'horarios'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!estabelecimento || !hub) {
    return false;
  }

  const diaSemana = now.getDay();
  const horarioHoje = hub.horarios.find((item) => item.dia_semana === diaSemana);
  if (!horarioHoje || !horarioHoje.aberto || !horarioHoje.hora_fecha) {
    return false;
  }

  const agoraMin = now.getHours() * 60 + now.getMinutes();
  const fechaMin = paraMinutos(horarioHoje.hora_fecha);
  const margemTotalMin = estabelecimento.tempo_medio_entrega_min + businessConfig.margemHorarioPedidoMin;

  return agoraMin + margemTotalMin <= fechaMin;
}

/**
 * Story 6.4 (AC1, AC4). COALESCE: `estabelecimento.ticket_minimo_reais`
 * tem prioridade quando não-nulo; senão usa o global
 * `businessConfig.ticketMinimoReais` (já existe, valor 20, sem mudança).
 * Sem `estabelecimento` ainda carregado, usa o global também — mesma
 * semântica de fallback; `20`/`"R$ 20"` nunca aparece hard-coded fora
 * deste COALESCE.
 */
export function calcularTicketMinimo(
  estabelecimento: Pick<Estabelecimento, 'ticket_minimo_reais'> | null | undefined,
): number {
  return estabelecimento?.ticket_minimo_reais ?? businessConfig.ticketMinimoReais;
}

/**
 * Story 6.4 (AC2, AC3). Quanto falta para atingir o ticket mínimo — nunca
 * negativo. "Abaixo do mínimo" é estritamente `<`, não `<=`: subtotal
 * exatamente igual ao mínimo é um pedido válido (falta = 0).
 */
export function faltaParaTicketMinimo(subtotalReais: number, ticketMinimo: number): number {
  return Math.max(ticketMinimo - subtotalReais, 0);
}

/**
 * Story 6.5 (AC1, gap 3 das Dependencies). Decide se `cart.cpfCollected`
 * (flag de SESSÃO do `CartContext`, perdida ao reabrir o app) precisa ser
 * sincronizada com o dado REAL do cliente (`clientes.cpf`) — sem isso,
 * reabrir o app reapresentaria o modal de CPF indevidamente mesmo com o
 * CPF já salvo no backend. Extraída como função pura testável (mesmo
 * padrão de `shouldConfirmStoreSwitch`, `apps/cliente/src/lib/cartRules.ts`)
 * porque `apps/cliente` não tem harness de teste de componente/hook React
 * (gap de infraestrutura já documentado nas Stories 2.1/5.4/5.6) — o
 * `useEffect` que efetivamente chama `cart.markCpfCollected()` em
 * `Checkout.tsx` não é testável por unidade, mas esta decisão é.
 */
export function deveSincronizarCpfCollected(
  clienteCpf: string | null | undefined,
  cpfCollected: boolean,
): boolean {
  return clienteCpf != null && !cpfCollected;
}
