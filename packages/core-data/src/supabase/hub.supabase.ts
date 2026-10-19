import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { Hub, HubHorario, HubPort } from '../ports/hub.port';
import type { AsyncCallOptions } from '../types';

const HUB_COLUMNS = 'id, nome, endereco, lat, lng, ponto_referencia, foto_url, ativo';

type HubRow = {
  id: string;
  nome: string;
  endereco: string;
  lat: number;
  lng: number;
  ponto_referencia: string | null;
  foto_url: string | null;
  ativo: boolean;
};

type HubHorarioRow = {
  dia_semana: number;
  aberto: boolean;
  hora_abre: string | null;
  hora_fecha: string | null;
};

/**
 * Story 5.1 — [IDS] ADAPT do mesmo padrão de mapeamento já implementado em
 * `admin.supabase.ts#mapRowToHub` (Story 4.1, `AdminPort.hubsCrud`). Não
 * importado diretamente do módulo Admin (ports diferentes, cada
 * `*.supabase.ts` é autocontido) — a lógica é replicada, não a dependência
 * cross-app. Mapeamento explícito campo a campo (não spread) garante que
 * nenhuma coluna extra vaze para o `Hub` devolvido ao Cliente.
 */
function mapRowToHub(row: HubRow, horariosRows: HubHorario[]): Hub {
  return {
    id: row.id,
    nome: row.nome,
    endereco: row.endereco,
    lat: row.lat,
    lng: row.lng,
    ponto_referencia: row.ponto_referencia,
    foto_url: row.foto_url,
    ativo: row.ativo,
    horarios: [...horariosRows].sort((a, b) => a.dia_semana - b.dia_semana),
  };
}

/**
 * Story 5.1 — [IDS] ADAPT do mesmo padrão de `admin.supabase.ts#fetchHorariosByHubIds`
 * (evita N+1 quando `listNearby` lista vários hubs de uma vez, AC3).
 */
async function fetchHorariosByHubIds(
  supabase: SupabaseClient<Database>,
  hubIds: string[],
): Promise<Map<string, HubHorario[]>> {
  const porHub = new Map<string, HubHorario[]>();
  if (hubIds.length === 0) {
    return porHub;
  }

  const { data, error } = await supabase
    .from('hubs_horarios')
    .select('hub_id, dia_semana, aberto, hora_abre, hora_fecha')
    .in('hub_id', hubIds);
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as (HubHorarioRow & { hub_id: string })[];
  for (const row of rows) {
    const lista = porHub.get(row.hub_id) ?? [];
    lista.push({ dia_semana: row.dia_semana, aberto: row.aberto, hora_abre: row.hora_abre, hora_fecha: row.hora_fecha });
    porHub.set(row.hub_id, lista);
  }
  return porHub;
}

/**
 * Story 5.1 (AC3, AC4, AC5) — releitura completa (hub + `hubs_horarios`) por
 * `id`, sob a RLS `publico_ve_hubs` já aplicada (Story 4.1). `.maybeSingle()`
 * — `null` honesto quando o `id` não existe OU quando a RLS bloqueia por o
 * hub estar inativo e o chamador não ser admin (indistinguível por design,
 * mesma postura de `store.getById`/`admin.supabase.ts#fetchHubById`).
 */
async function fetchHubById(supabase: SupabaseClient<Database>, id: string): Promise<Hub | null> {
  const { data, error } = await supabase.from('hubs').select(HUB_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  const row = data as unknown as HubRow;

  const { data: horariosData, error: horariosError } = await supabase
    .from('hubs_horarios')
    .select('dia_semana, aberto, hora_abre, hora_fecha')
    .eq('hub_id', id);
  if (horariosError) {
    throw horariosError;
  }

  return mapRowToHub(row, (horariosData ?? []) as unknown as HubHorarioRow[]);
}

/**
 * Esqueleto Supabase de `HubPort` (Story 1.9). Leitura de Hubs pelo Cliente
 * (`listNearby`/`getById`) é Descoberta (Épico 5) — cadastro de Hubs pelo
 * Admin vive em `AdminPort.hubsCrud` (Épico 4), não aqui.
 *
 * Story 5.1 — `listNearby`/`getById` implementados de verdade (override
 * SIMPLE do piloto: sem GPS/mapa/Haversine/geocoding, ver `docs/prd/07-plano-mvp-piloto.md`).
 */
export function createHubSupabase(client?: SupabaseClient<Database>): HubPort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    /**
     * Story 5.1 (AC3, AC4) — `SELECT` em `hubs` filtrado por `ativo = true`
     * (RLS `publico_ve_hubs` já garante isso para não-admin, o filtro
     * explícito aqui é redundante por defesa em profundidade, mesmo padrão
     * de `product.supabase.ts#list`), ordenado por `nome ASC`.
     *
     * [AUTO-DECISION] Ordenação por `nome ASC` → (reason: o mock não
     * garante ordem determinística e uma lista real via `SELECT` sem
     * `ORDER BY` não tem ordem garantida pelo Postgres; sem distância real
     * para ordenar — fora do piloto — `nome` é o critério mais previsível e
     * neutro para o usuário. Não contradiz nenhuma AC do épico. Se o Caio
     * quiser outra ordem, é uma decisão de regra de negócio a registrar em
     * `docs/PERGUNTAS_REGRAS_NEGOCIO.md`, não presumida aqui — ver Dev Notes
     * da Story 5.1.)
     *
     * Sem cálculo de distância Haversine (override SIMPLE do piloto) — a
     * distância exibida ao Cliente continua o valor estático fixado na
     * Story 0.6 (`formatHubDistanciaKm`), não tocado por este método.
     */
    async listNearby(_options?: AsyncCallOptions): Promise<Hub[]> {
      const supabase = resolveClient();

      const { data, error } = await supabase
        .from('hubs')
        .select(HUB_COLUMNS)
        .eq('ativo', true)
        .order('nome', { ascending: true });
      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as HubRow[];
      if (rows.length === 0) {
        return [];
      }

      const horariosPorHub = await fetchHorariosByHubIds(
        supabase,
        rows.map((row) => row.id),
      );
      return rows.map((row) => mapRowToHub(row, horariosPorHub.get(row.id) ?? []));
    },

    /** Story 5.1 (AC3, AC4, AC5) — ver JSDoc de `fetchHubById` acima. */
    async getById(id: string, _options?: AsyncCallOptions): Promise<Hub | null> {
      return fetchHubById(resolveClient(), id);
    },
  };
}
