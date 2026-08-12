import type { AsyncCallOptions } from '../types';
import type { Produto } from './product.port';

export type EstabelecimentoStatus = 'em_analise' | 'ativo' | 'rejeitado' | 'suspenso';

/**
 * "Estado da loja" (AC1) — valor DERIVADO, não uma coluna do schema:
 * `pausado_manualmente = true` → 'pausada'; fora do horário do dia corrente
 * (`estabelecimentos_horarios`) → 'fechada'; caso contrário → 'aberta'.
 * A derivação vive no mock (`store.mock.ts`) para não vazar lógica de data/hora
 * para o tipo de domínio.
 * [Source: docs/stories/0.2.story.md#Dev Notes]
 */
export type LojaEstado = 'aberta' | 'fechada' | 'pausada';

/**
 * Domínio: tabela `estabelecimentos_horarios`.
 * [Source: docs/architecture/03-data-models.md#1.5]
 */
export interface EstabelecimentoHorario {
  dia_semana: number;
  aberto: boolean;
  hora_abre: string | null;
  hora_fecha: string | null;
}

/**
 * Domínio: tabela `estabelecimentos`.
 * [Source: docs/architecture/03-data-models.md#1.4]
 */
export interface Estabelecimento {
  id: string;
  nome_fantasia: string;
  categoria: string;
  descricao: string | null;
  foto_fachada_url: string | null;
  endereco: string;
  lat: number;
  lng: number;
  raio_atendimento_km: number;
  tempo_medio_entrega_min: number;
  taxa_deslocamento_reais: number;
  /** `null` = usa o global `businessConfig.ticketMinimoReais` (COALESCE). */
  ticket_minimo_reais: number | null;
  status: EstabelecimentoStatus;
  motivo_rejeicao: string | null;
  motivo_suspensao: string | null;
  pausado_manualmente: boolean;
  horarios: EstabelecimentoHorario[];
}

export interface StorePort {
  /**
   * Lojas que atendem um determinado hub. No MVP, o schema não tem FK direta
   * `estabelecimento -> hub` (é geo/raio_atendimento_km) — o mock atual só
   * seed 1 hub, então retorna todas as lojas ativas. Documentado como
   * simplificação aceitável para o Épico 0 (ver Story 0.2 Dev Notes).
   */
  listByHub(hubId: string, options?: AsyncCallOptions): Promise<Estabelecimento[]>;
  getCatalog(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Produto[]>;
  /**
   * Stories 4.7/4.8 (Dependencies, decisão de arquitetura COMPARTILHADA) —
   * [AUTO-DECISION] resolvida por `@dev` (sem sessão dedicada de
   * `@architect` nesta execução — revisão formal fica registrada como débito
   * das Quality Gate Tasks das duas Stories, não bloqueante).
   *
   * Escolhida a Opção (a) das Stories ("implementar `getById` real, sob a
   * MESMA RLS já existente `publico_ve_ativos`, que já libera
   * `dono_user_id = auth.uid()`") em vez da Opção (b) (método de leitura
   * dedicado ao lojista) → (reason: `apps/lojista/src/navigation/lojistaSession.ts`
   * já documenta — Story 9.0.4 — que TODAS as telas de `MainTabs` resolvem a
   * loja do lojista logado via o MESMO `CURRENT_ESTABELECIMENTO_ID` fixo
   * consumido por `StorePort.getById`, e que reconciliar isso com a
   * identidade real do lojista autenticado é carry-forward explícito para o
   * Épico 6+. Um método de leitura paralelo baseado em
   * `dono_user_id = auth.uid()` (padrão "own-read" de
   * `EstabelecimentoCadastroPort`) operaria sobre um domínio mock DIFERENTE
   * (`db.estabelecimentosCadastrados`, populado só após o wizard de cadastro
   * + login real) — divergindo da fixture sempre disponível
   * (`db.estabelecimentos`) que toda a `MainTabs` já assume, quebrando a
   * navegabilidade mock hoje estabelecida sem essa reconciliação maior. Ficar
   * dentro de `getById` mantém `LojaDisponibilidadeContext.tsx` (Stories
   * 4.7/4.8) INTOCADO e reaproveita a RLS já existente sem migration nova.
   *
   * Escopo deliberadamente ESTREITO: só esta leitura de UMA linha por `id`
   * (mais suas `estabelecimentos_horarios`) foi implementada — `listByHub`/
   * `getCatalog`/`getState` (proximidade, filtros de catálogo público)
   * continuam stub `Épico 5`, não tocados por esta decisão.
   */
  getById(id: string, options?: AsyncCallOptions): Promise<Estabelecimento | null>;
  getState(id: string, options?: AsyncCallOptions): Promise<LojaEstado>;
  /**
   * Persiste `pausado_manualmente` — promovido do estado "local-only" de
   * `apps/lojista/src/screens/catalogo/LojaDisponibilidadeContext.tsx`
   * (Story 0.9). Sobrevive a um novo `getById` (não se perde em remounts).
   *
   * Story 4.8 (AC1, AC2, AC4) — adapter Supabase real: `UPDATE` restrito ao
   * dono via RLS `lojista_atualiza_proprio` (`docs/architecture/05-security.md
   * §3.4`, já aplicada — sem migration nova), sempre relendo o
   * estabelecimento pós-escrita via `getById` (nunca ecoa o input).
   */
  setPausadoManualmente(
    estabelecimentoId: string,
    pausado: boolean,
    options?: AsyncCallOptions,
  ): Promise<Estabelecimento>;

  /**
   * Story 4.7 (AC1, AC3) — [IDS] CREATE. `UPDATE` real das 7 linhas de
   * `estabelecimentos_horarios` (upsert por `(estabelecimento_id,
   * dia_semana)`, mesma PRIMARY KEY da tabela — nunca um `INSERT` puro, as 7
   * linhas já existem desde o wizard de cadastro, Story 3.5), sob a RLS
   * `lojista_gerencia_horarios` já existente (`FOR ALL`, dono via
   * `dono_user_id = auth.uid()`) — sem migration/RLS nova.
   *
   * Recebe e devolve o array completo de 7 `EstabelecimentoHorario` (mesmo
   * shape já usado por `Estabelecimento.horarios`/`EstabelecimentoCadastroPort`
   * — `[IDS] REUSE`, não um input paralelo). O valor de retorno é sempre a
   * releitura real pós-escrita (nunca um eco do input) — falha (rede, RLS,
   * violação do `CHECK aberto = false OR hora_abre < hora_fecha`) rejeita a
   * Promise, sem sucesso simulado.
   *
   * Validação client-side (`hora_abre < hora_fecha` quando `aberto = true`)
   * é responsabilidade da UI (mesmo `CHECK` espelhado, ver
   * `validarHorariosSemanais` abaixo); os adapters (mock/Supabase) também
   * validam antes de persistir, como defesa em profundidade — nunca confiam
   * só na tela.
   */
  updateHorarios(
    estabelecimentoId: string,
    horarios: EstabelecimentoHorario[],
    options?: AsyncCallOptions,
  ): Promise<EstabelecimentoHorario[]>;

  /**
   * Story 3.3 (AC2, AC4) — [IDS] ADAPT de `StorePort` (já é a port dona de
   * `Estabelecimento`, em vez de criar uma port nova só para uma checagem).
   * Checagem RASA e antecipada de duplicidade de CNPJ no Passo 1 do
   * cadastro do lojista (`CadastroPasso1.tsx`) — resolve `true` quando o
   * CNPJ está disponível, `false` quando já está cadastrado. Nunca expõe
   * qual outro estabelecimento tem esse CNPJ, nome fantasia ou dono (Dev
   * Notes > Segurança da Story 3.3) — só o booleano.
   *
   * [AUTO-DECISION] Contrato de retorno booleano em vez de lançar um erro
   * dedicado (`CnpjJaCadastradoError`) → (reason: as Tasks da Story 3.3
   * descrevem o contrato como "retorna disponível/já cadastrado" — um
   * valor, não uma exceção; e esta chamada é um feedback antecipado de UX,
   * não o submit final que grava em `estabelecimentos` — esse sim deve
   * confiar na constraint `cnpj UNIQUE` do banco (Story 3.5), não nesta
   * função).
   *
   * [AUTO-DECISION] Mecanismo de checagem sob RLS (função `SECURITY
   * DEFINER` booleana, Edge Function dedicada, ou outro) — a Story 3.3
   * (Tasks) atribui essa decisão a `@architect`, não executada nesta
   * sessão solo de `@dev`. Como `estabelecimentos` ainda não existe
   * (Stories 3.4/3.5, fora deste lote), não há query real para proteger
   * sob RLS hoje — o adapter Supabase desta Story é um SEAM HONESTO
   * (sempre `true`, ver `store.supabase.ts`), então a decisão de mecanismo
   * fica registrada como débito para quando a 3.5 existir, não bloqueando
   * esta Story (ver Dev Agent Record de `docs/stories/3.3.story.md`).
   *
   * Modo mock: sempre `true` — o tipo `Estabelecimento` mock não modela
   * `cnpj` (ver definição acima), então nenhuma fixture pode colidir; não é
   * uma limitação desta função, é o schema mock atual (Dependencies da
   * Story 3.3). Modo Supabase: `estabelecimentos` ainda não existe —
   * sempre `true`, documentado no adapter, sem tentar consultar uma tabela
   * inexistente nem fingir um erro.
   */
  checkCnpjDisponivel(cnpj: string, options?: AsyncCallOptions): Promise<boolean>;
}

const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function paraMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Story 4.7 (AC1, AC3) — [IDS] CREATE. Valida as 7 linhas de `horarios`
 * espelhando o `CHECK` do banco em `estabelecimentos_horarios`
 * (`aberto = false OR (hora_abre IS NOT NULL AND hora_fecha IS NOT NULL AND
 * hora_abre < hora_fecha)`, `docs/architecture/03-data-models.md#1.5`).
 *
 * Fonte única da regra — reaproveitada pelos adapters mock/Supabase de
 * `StorePort.updateHorarios` como defesa em profundidade (nunca confiam só
 * na validação da tela); a UI (`apps/lojista`) tem sua própria validação
 * amigável (com nome do dia) e não depende desta função — mensagens aqui são
 * genéricas o bastante para um erro honesto de adapter.
 *
 * Retorna `null` quando todos os dias são válidos, ou a mensagem do
 * primeiro dia inválido encontrado.
 */
export function validarHorariosSemanais(horarios: EstabelecimentoHorario[]): string | null {
  for (const horario of horarios) {
    if (!horario.aberto) continue;
    if (
      !horario.hora_abre ||
      !horario.hora_fecha ||
      !HORA_REGEX.test(horario.hora_abre) ||
      !HORA_REGEX.test(horario.hora_fecha)
    ) {
      return `Horário inválido (hh:mm) para o dia_semana=${horario.dia_semana}.`;
    }
    if (paraMinutos(horario.hora_abre) >= paraMinutos(horario.hora_fecha)) {
      return `hora_abre deve ser antes de hora_fecha (dia_semana=${horario.dia_semana}).`;
    }
  }
  return null;
}
