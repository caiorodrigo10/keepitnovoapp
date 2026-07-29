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
  getById(id: string, options?: AsyncCallOptions): Promise<Estabelecimento | null>;
  getState(id: string, options?: AsyncCallOptions): Promise<LojaEstado>;
  /**
   * Persiste `pausado_manualmente` — promovido do estado "local-only" de
   * `apps/lojista/src/screens/catalogo/LojaDisponibilidadeContext.tsx`
   * (Story 0.9). Sobrevive a um novo `getById` (não se perde em remounts).
   */
  setPausadoManualmente(
    estabelecimentoId: string,
    pausado: boolean,
    options?: AsyncCallOptions,
  ): Promise<Estabelecimento>;
}
