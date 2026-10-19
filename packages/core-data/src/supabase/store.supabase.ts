import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { Produto } from '../ports/product.port';
import {
  deriveLojaEstado,
  validarHorariosSemanais,
  type Estabelecimento,
  type EstabelecimentoHorario,
  type EstabelecimentoStatus,
  type LojaEstado,
  type StorePort,
} from '../ports/store.port';
import type { AsyncCallOptions } from '../types';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'store';
const EPIC_DESCOBERTA = 'Épico 5';
/** Bucket privado das fachadas; clientes recebem somente URL assinada. */
const FACHADAS_BUCKET = 'fachadas';
/** Expiração curta, no mesmo padrão dos adapters de lojista e admin. */
const FOTO_FACHADA_SIGNED_URL_EXPIRES_IN_SECONDS = 300;

/** Campos comerciais publicados pela view com RLS do chamador. */
export const ESTABELECIMENTO_PUBLICO_COLUMNS =
  'id, nome_fantasia, categoria, descricao, foto_fachada_url, endereco, lat, lng, raio_atendimento_km, tempo_medio_entrega_min, taxa_deslocamento_reais, ticket_minimo_reais, status, pausado_manualmente';

export type EstabelecimentoRow = {
  id: string;
  nome_fantasia: string;
  categoria: string;
  descricao: string | null;
  foto_fachada_url: string | null;
  endereco: string;
  lat: number | null;
  lng: number | null;
  raio_atendimento_km: number | null;
  tempo_medio_entrega_min: number;
  taxa_deslocamento_reais: number;
  ticket_minimo_reais: number | null;
  status: string;
  motivo_rejeicao?: string | null;
  motivo_suspensao?: string | null;
  pausado_manualmente: boolean;
  excluido_em?: string | null;
};

type EstabelecimentoHorarioRow = {
  dia_semana: number;
  aberto: boolean;
  hora_abre: string | null;
  hora_fecha: string | null;
};

/**
 * Stories 4.7/4.8 (Dependencies) — releitura das 7 linhas de
 * `estabelecimentos_horarios`, ordenadas por `dia_semana` (mesmo padrão de
 * ordenação de `estabelecimento-cadastro.supabase.ts#fetchMeuPerfilPorDono`).
 * Sob a RLS `lojista_gerencia_horarios`/`publico_ve_horarios` já existentes
 * (Story 3.5) — sem migration nova.
 */
export async function fetchHorarios(
  supabase: SupabaseClient<Database>,
  estabelecimentoId: string,
): Promise<EstabelecimentoHorario[]> {
  const { data, error } = await supabase
    .from('estabelecimentos_horarios')
    .select('dia_semana, aberto, hora_abre, hora_fecha')
    .eq('estabelecimento_id', estabelecimentoId);
  if (error) {
    throw error;
  }
  return ((data ?? []) as unknown as EstabelecimentoHorarioRow[])
    .slice()
    .sort((a, b) => a.dia_semana - b.dia_semana)
    .map((h) => ({ dia_semana: h.dia_semana, aberto: h.aberto, hora_abre: h.hora_abre, hora_fecha: h.hora_fecha }));
}

type EstabelecimentoHubRow = {
  estabelecimento_id: string;
};

/**
 * Story 5.2 (AC2, AC6) — ids de `estabelecimentos` associados a um `hub_id`
 * via `estabelecimentos_hubs`, sob a RLS `publico_ve_estab_hubs` já aplicada
 * (migration `20260812213002_criar_estabelecimentos_hubs.sql`, fail-closed:
 * só expõe o par se hub ativo E loja ativa/não-excluída). Hub
 * sem nenhuma linha na junção resolve `[]` honesto (AC6) — nunca lança, nunca
 * simula.
 */
async function fetchEstabelecimentoIdsPorHub(
  supabase: SupabaseClient<Database>,
  hubId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('estabelecimentos_hubs')
    .select('estabelecimento_id')
    .eq('hub_id', hubId);
  if (error) {
    throw error;
  }
  return ((data ?? []) as unknown as EstabelecimentoHubRow[]).map((row) => row.estabelecimento_id);
}

/**
 * Stories 4.7/4.8 — [AUTO-DECISION] ver JSDoc de `StorePort.getById`
 * (`ports/store.port.ts`) para o racional completo de por que este método
 * (escopo estreito: 1 linha por `id`) foi implementado de verdade nesta
 * dupla de Stories, em vez de permanecer stub `Épico 5`.
 *
 * `lat`/`lng`/`raio_atendimento_km` são `NULLABLE` no banco (Story 3.4,
 * "geo adiado") mas `number` (não-nulo) no tipo de domínio `Estabelecimento`
 * (que modela o contrato de Descoberta pública, Épico 5, onde esses campos
 * são esperados sempre presentes) — coalescidos para `0` aqui como sentinela
 * honesto de "não informado", mesmo tipo de gap já sinalizado no Dev Notes
 * das Stories 4.7/4.8. Nenhuma tela desta dupla de Stories renderiza esses 3
 * campos — o coalesce só existe para satisfazer o contrato de tipo do
 * `StorePort` existente, não é lido por `HorariosDisponibilidade.tsx`.
 */
export function mapRowToEstabelecimento(row: EstabelecimentoRow, horarios: EstabelecimentoHorario[]): Estabelecimento {
  return {
    id: row.id,
    nome_fantasia: row.nome_fantasia,
    categoria: row.categoria,
    descricao: row.descricao,
    foto_fachada_url: row.foto_fachada_url,
    endereco: row.endereco,
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    raio_atendimento_km: row.raio_atendimento_km ?? 0,
    tempo_medio_entrega_min: row.tempo_medio_entrega_min,
    taxa_deslocamento_reais: row.taxa_deslocamento_reais,
    ticket_minimo_reais: row.ticket_minimo_reais,
    status: row.status as EstabelecimentoStatus,
    motivo_rejeicao: row.motivo_rejeicao ?? null,
    motivo_suspensao: row.motivo_suspensao ?? null,
    pausado_manualmente: row.pausado_manualmente,
    excluido_em: row.excluido_em ?? null,
    horarios,
  };
}

/**
 * Resolve o path privado da fachada para uma URL utilizável pela UI cliente.
 * Falhas de Storage não impedem a leitura da loja: a foto degrada para o
 * placeholder, sem jamais devolver o path privado cru.
 */
async function resolverFotoFachadaUrl(
  supabase: SupabaseClient<Database>,
  estabelecimento: Estabelecimento,
): Promise<Estabelecimento> {
  const fotoFachadaUrl = estabelecimento.foto_fachada_url;
  if (!fotoFachadaUrl || /^https?:\/\//i.test(fotoFachadaUrl)) {
    return estabelecimento;
  }

  try {
    const { data, error } = await supabase.storage
      .from(FACHADAS_BUCKET)
      .createSignedUrl(fotoFachadaUrl, FOTO_FACHADA_SIGNED_URL_EXPIRES_IN_SECONDS);
    return {
      ...estabelecimento,
      foto_fachada_url: error ? null : (data?.signedUrl ?? null),
    };
  } catch {
    return { ...estabelecimento, foto_fachada_url: null };
  }
}

async function fetchEstabelecimentoPorId(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<Estabelecimento | null> {
  const { data, error } = await supabase
    .from('estabelecimentos_publicos')
    .select(ESTABELECIMENTO_PUBLICO_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  let rowData = data as EstabelecimentoRow | null;
  if (!rowData) {
    const { data: privateRows, error: privateError } = await supabase.rpc('obter_estabelecimentos_privados', { p_id: id });
    if (privateError && privateError.code !== '42501') {
      throw privateError;
    }
    rowData = (privateRows?.[0] ?? null) as EstabelecimentoRow | null;
  }
  if (!rowData) {
    return null;
  }
  const row = rowData;
  const horarios = await fetchHorarios(supabase, id);

  return resolverFotoFachadaUrl(supabase, mapRowToEstabelecimento(row, horarios));
}

/** Busca pela projeção pública os ids vinculados ao hub. A view já exclui
 * lojas não ativas e registros excluídos; lista vazia evita a consulta.
 */
async function fetchEstabelecimentosPorIds(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Estabelecimento[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('estabelecimentos_publicos')
    .select(ESTABELECIMENTO_PUBLICO_COLUMNS)
    .in('id', ids)
    .eq('status', 'ativo');
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as EstabelecimentoRow[];
  return Promise.all(
    rows.map(async (row) => resolverFotoFachadaUrl(supabase, mapRowToEstabelecimento(row, await fetchHorarios(supabase, row.id)))),
  );
}

/**
 * Esqueleto Supabase de `StorePort` (Story 1.9). `getCatalog` continua stub
 * `Épico 5` — método MORTO sem consumidor real na UI (`Loja.tsx` usa
 * `ProductPort.list`, Story 5.4 Dependencies), não implementado por nenhuma
 * Story até aqui. `getById` (Stories 4.7/4.8, escopo estreito — ver JSDoc de
 * `fetchEstabelecimentoPorId`), `setPausadoManualmente` (Story 4.8),
 * `updateHorarios` (Story 4.7), `listByHub` (Story 5.2) e `getState`
 * (Story 5.3) são leitura/escrita reais.
 */
export function createStoreSupabase(client?: SupabaseClient<Database>): StorePort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    /**
     * Story 5.2 (AC2, AC3, AC6) — RECORTE HONESTO (substitui a Edge Function
     * `lojas-por-hub` com Haversine do texto literal do épico): junção
     * explícita `estabelecimentos_hubs` × `estabelecimentos`, sob a RLS
     * `publico_ve_estab_hubs` já aplicada (hub ativo E loja
     * ativa/não-excluída) + filtro client-side redundante
     * (defesa em profundidade). Sem `raio_atendimento_km`/Haversine.
     *
     * A POPULAÇÃO de `estabelecimentos_hubs` é a decisão de negócio BR-HUB
     * (pendente do Caio) — esta Story NÃO popula, NÃO cria UI/RPC de
     * vínculo. Enquanto a associação não existir para um hub, este método
     * resolve `[]` de forma correta e verificável (AC6) — nunca lança, nunca
     * simula lojas.
     */
    async listByHub(hubId: string, _options?: AsyncCallOptions): Promise<Estabelecimento[]> {
      // A seleção de hub é opcional no primeiro acesso à Home. Nunca deixe um
      // identificador vazio chegar ao PostgREST (`hub_id=eq.` retorna 400).
      if (!hubId.trim()) {
        return [];
      }
      const supabase = resolveClient();
      const ids = await fetchEstabelecimentoIdsPorHub(supabase, hubId);
      return fetchEstabelecimentosPorIds(supabase, ids);
    },

    async getCatalog(_estabelecimentoId: string, _options?: AsyncCallOptions): Promise<Produto[]> {
      throw new NotImplementedError(PORT, 'getCatalog', EPIC_DESCOBERTA);
    },

    /** Stories 4.7/4.8 — ver JSDoc de `fetchEstabelecimentoPorId` acima e de `StorePort.getById`. */
    async getById(id: string, _options?: AsyncCallOptions): Promise<Estabelecimento | null> {
      return fetchEstabelecimentoPorId(resolveClient(), id);
    },

    /**
     * Story 5.3 (AC1, AC3, AC4) — reaproveita `fetchEstabelecimentoPorId`
     * (já existente, Stories 4.7/4.8, mesma releitura sob a RLS
     * `publico_ve_ativos`/`publico_ve_horarios`) e aplica `deriveLojaEstado`
     * (fonte única compartilhada com o mock, `[IDS] ADAPT`, `store.port.ts`)
     * ao resultado. Estabelecimento inexistente ou bloqueado pela RLS lança
     * (mesmo padrão de `getById` para o restante do domínio) — nunca simula
     * um estado.
     */
    async getState(id: string, _options?: AsyncCallOptions): Promise<LojaEstado> {
      const estabelecimento = await fetchEstabelecimentoPorId(resolveClient(), id);
      if (!estabelecimento) {
        throw new Error(
          `[core-data/supabase] getState — Estabelecimento não encontrado ou RLS bloqueando: ${id}.`,
        );
      }
      return deriveLojaEstado(estabelecimento);
    },

    /** Atualiza a própria loja por RLS e confirma a autorização na RPC privada
     * antes de devolver o estado persistido. Uma loja pública de outro dono
     * pode ser lida, mas não conta como sucesso da escrita.
     */
    async setPausadoManualmente(
      estabelecimentoId: string,
      pausado: boolean,
      _options?: AsyncCallOptions,
    ): Promise<Estabelecimento> {
      const supabase = resolveClient();

      const { error } = await supabase
        .from('estabelecimentos')
        .update({ pausado_manualmente: pausado })
        .eq('id', estabelecimentoId);
      if (error) {
        throw error;
      }

      const { data: autorizadas, error: autorizacaoError } = await supabase.rpc('obter_estabelecimentos_privados', { p_id: estabelecimentoId });
      if (autorizacaoError) {
        throw autorizacaoError;
      }
      if (!autorizadas?.some((loja) => loja.id === estabelecimentoId)) {
        throw new Error('[core-data/supabase] setPausadoManualmente — UPDATE concluiu mas não encontrou a linha autorizada.');
      }

      const atualizado = await fetchEstabelecimentoPorId(supabase, estabelecimentoId);
      if (!atualizado) {
        throw new Error(
          '[core-data/supabase] setPausadoManualmente — UPDATE concluiu com sucesso mas a releitura não encontrou a linha (RLS bloqueando estabelecimento de outro dono, ou id inexistente).',
        );
      }
      return atualizado;
    },

    /**
     * Story 4.7 (AC1, AC3). `UPSERT` das 7 linhas por `(estabelecimento_id,
     * dia_semana)` (mesma PRIMARY KEY da tabela) sob a RLS
     * `lojista_gerencia_horarios` (`FOR ALL`, já aplicada) — nunca um
     * `INSERT` puro, as 7 linhas já existem desde o wizard de cadastro
     * (Story 3.5). Valida `hora_abre < hora_fecha` (mesmo `CHECK` do banco)
     * ANTES de tocar a rede — defesa em profundidade, nunca confia só na
     * validação da tela. Sempre relê as 7 linhas reais pós-escrita (nunca
     * ecoa o input recebido).
     */
    async updateHorarios(
      estabelecimentoId: string,
      horarios: EstabelecimentoHorario[],
      _options?: AsyncCallOptions,
    ): Promise<EstabelecimentoHorario[]> {
      const supabase = resolveClient();

      const erro = validarHorariosSemanais(horarios);
      if (erro) {
        throw new Error(`[core-data/supabase] updateHorarios — ${erro}`);
      }

      const rows = horarios.map((horario) => ({
        estabelecimento_id: estabelecimentoId,
        dia_semana: horario.dia_semana,
        aberto: horario.aberto,
        hora_abre: horario.aberto ? horario.hora_abre : null,
        hora_fecha: horario.aberto ? horario.hora_fecha : null,
      }));

      const { error } = await supabase
        .from('estabelecimentos_horarios')
        .upsert(rows, { onConflict: 'estabelecimento_id,dia_semana' });
      if (error) {
        throw error;
      }

      return fetchHorarios(supabase, estabelecimentoId);
    },

    /**
     * Story 3.3 (AC2, AC4) — SEAM HONESTO, deliberadamente DIFERENTE do
     * padrão `NotImplementedError` usado pelos demais métodos deste
     * esqueleto. `CadastroPasso1.tsx` (Story 3.2, já em produção em modo
     * `DATA_SOURCE=supabase`) chama este método no caminho ativo do
     * cadastro do lojista — lançar `NotImplementedError` aqui bloquearia o
     * cadastro real por um recurso (`estabelecimentos`) que nem deveria
     * existir ainda nesta fase (Stories 3.4/3.5, fora deste lote).
     *
     * NÃO tenta um `supabase.from('estabelecimentos')...` — a tabela não
     * existe no `keepit-dev` até a Story 3.4/3.5 rodar essa migration, e
     * consultar uma tabela inexistente falharia com erro de schema, não um
     * "não encontrado" honesto. Resolve sempre `true` ("disponível") — nem
     * finge sucesso de uma consulta real, nem finge um erro de rede; é
     * literalmente um no-op documentado (AC4: "comportamento correto é
     * sempre disponível, não um falso negativo", até que existam lojistas
     * com cadastro completo).
     *
     * Quando a 3.4/3.5 existir, substituir este corpo por uma consulta real
     * sob o mecanismo de RLS que o @architect decidir (função `SECURITY
     * DEFINER` booleana, Edge Function, etc. — ver débito registrado no
     * JSDoc de `StorePort.checkCnpjDisponivel`, `ports/store.port.ts`).
     */
    async checkCnpjDisponivel(_cnpj: string, _options?: AsyncCallOptions): Promise<boolean> {
      return true;
    },
  };
}
