import type { AsyncCallOptions } from '../types';

/**
 * Domínio: tabela `hubs_horarios` (7 linhas por hub, uma por dia da semana).
 * [Source: docs/architecture/03-data-models.md#2.2]
 */
export interface HubHorario {
  /** 0 = domingo ... 6 = sábado. */
  dia_semana: number;
  aberto: boolean;
  /** `HH:mm`, `null` se `aberto = false`. */
  hora_abre: string | null;
  hora_fecha: string | null;
}

/**
 * Domínio: tabela `hubs`.
 * [Source: docs/architecture/03-data-models.md#2.1]
 */
export interface Hub {
  id: string;
  nome: string;
  endereco: string;
  lat: number;
  lng: number;
  ponto_referencia: string | null;
  foto_url: string | null;
  ativo: boolean;
  horarios: HubHorario[];
}

export interface HubPort {
  listNearby(options?: AsyncCallOptions): Promise<Hub[]>;
  getById(id: string, options?: AsyncCallOptions): Promise<Hub | null>;
}
