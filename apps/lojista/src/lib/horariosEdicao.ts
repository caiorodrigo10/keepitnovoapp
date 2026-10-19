/**
 * Lógica pura de edição de horários de funcionamento — Story 4.7 (AC1, AC3).
 *
 * [IDS] CREATE — mesmo padrão local-por-story de `./cadastroPasso3Submit.ts`
 * (Story 3.5) e `./cadastroPasso2Validation.ts` (Story 3.4): funções puras,
 * síncronas, testáveis isoladamente via `vitest`. NÃO reaproveita
 * `HorarioDraft`/`diaSemanaLabel` de `../screens/auth/cadastroDraft.ts` —
 * aquele shape é do domínio do WIZARD de cadastro (`AuthStack`, Story 0.8,
 * "RECORTE PROVISÓRIO... não é consumido fora de `apps/lojista`" já
 * documentado ali), enquanto esta Story edita a tela de disponibilidade já
 * cadastrada (`CatalogoStack`) — domínios de tela distintos, mesma forma de
 * dado por coincidência (7 dias, `hh:mm` texto livre — sem seletor de hora
 * nativo instalado, mesma limitação já documentada em `CadastroPasso3.tsx`).
 */

import type { EstabelecimentoHorario } from '@keepit/core-data';

export interface HorarioEdicaoDia {
  dia_semana: number;
  aberto: boolean;
  /** Texto livre `hh:mm` — `''` quando não preenchido (nunca `null`, diferente de `EstabelecimentoHorario`). */
  hora_abre: string;
  /** Texto livre `hh:mm` — `''` quando não preenchido (nunca `null`, diferente de `EstabelecimentoHorario`). */
  hora_fecha: string;
}

const DIAS_SEMANA_LABEL: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

/** Ordem de exibição/edição Seg → Dom (AC1) — mesma ordem de leitura já usada pela seção anterior (Seg-Sex, Sábado, Domingo). */
export const ORDEM_DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

export function diaSemanaLabel(dia: number): string {
  return DIAS_SEMANA_LABEL[dia] ?? `Dia ${dia}`;
}

/**
 * Converte as 7 linhas de `EstabelecimentoHorario` (fonte: `StorePort.getById`)
 * no shape editável em texto livre, na ordem Seg → Dom. Dia ausente na fonte
 * (não deveria acontecer — a RPC de cadastro sempre grava as 7 linhas, Story
 * 3.5 — mas tratado honestamente) vira "fechado" em branco, nunca inventa
 * um horário.
 */
export function horariosParaEdicao(horarios: EstabelecimentoHorario[]): HorarioEdicaoDia[] {
  const porDia = new Map(horarios.map((h) => [h.dia_semana, h]));
  return ORDEM_DIAS_SEMANA.map((dia_semana) => {
    const horario = porDia.get(dia_semana);
    return {
      dia_semana,
      aberto: horario?.aberto ?? false,
      hora_abre: horario?.hora_abre ?? '',
      hora_fecha: horario?.hora_fecha ?? '',
    };
  });
}

/**
 * Converte de volta para `EstabelecimentoHorario[]` (payload de
 * `StorePort.updateHorarios`) — `aberto = false` força `hora_abre`/
 * `hora_fecha` para `null`, mesmo contrato honesto de `buildHorariosPayload`
 * (`cadastroPasso3Submit.ts`, Story 3.5): nunca envia um horário residual de
 * quando o dia esteve marcado como aberto antes de o lojista desmarcar o
 * switch.
 */
export function edicaoParaHorarios(dias: HorarioEdicaoDia[]): EstabelecimentoHorario[] {
  return dias.map((dia) => ({
    dia_semana: dia.dia_semana,
    aberto: dia.aberto,
    hora_abre: dia.aberto ? dia.hora_abre : null,
    hora_fecha: dia.aberto ? dia.hora_fecha : null,
  }));
}

const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function paraMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Validação client-side espelhando o `CHECK` do banco em
 * `estabelecimentos_horarios` (`aberto = false OR (hora_abre < hora_fecha)`)
 * [Source: docs/architecture/03-data-models.md#1.5] — Story 4.7 (AC1).
 *
 * Mensagem AMIGÁVEL com o nome do dia (diferente de
 * `validarHorariosSemanais`, `@keepit/core-data`, que os adapters usam como
 * defesa em profundidade com mensagem genérica) — retorna a mensagem do
 * primeiro dia inválido, ou `null` quando os 7 dias são válidos.
 */
export function validarHorariosEdicao(dias: HorarioEdicaoDia[]): string | null {
  for (const dia of dias) {
    if (!dia.aberto) continue;
    if (!HORA_REGEX.test(dia.hora_abre) || !HORA_REGEX.test(dia.hora_fecha)) {
      return `Informe um horário válido (hh:mm) de abertura e fechamento em ${diaSemanaLabel(dia.dia_semana)}.`;
    }
    if (paraMinutos(dia.hora_abre) >= paraMinutos(dia.hora_fecha)) {
      return `Em ${diaSemanaLabel(dia.dia_semana)}, o horário de abertura deve ser antes do fechamento.`;
    }
  }
  return null;
}
