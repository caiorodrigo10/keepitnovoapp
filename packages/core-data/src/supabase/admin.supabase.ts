import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  AdminPort,
  CreateHubInput,
  EstabelecimentoAdmin,
  EstabelecimentoFalha,
  FinancialDashboardResult,
  HubFotoExt,
  HubFotoUploadInput,
  ReembolsoPendente,
  UpdateHubInput,
} from '../ports/admin.port';
import type { ChavePixTipoCadastro } from '../ports/estabelecimento-cadastro.port';
import type { Cliente } from '../ports/auth.port';
import type { Hub, HubHorario } from '../ports/hub.port';
import type { Pedido, PedidoStatus } from '../ports/order.port';
import type { Estabelecimento, EstabelecimentoHorario, EstabelecimentoStatus } from '../ports/store.port';
import type { AsyncCallOptions } from '../types';
import {
  AcessoNegadoError,
  AutenticacaoNecessariaError,
  EstabelecimentoNaoEncontradoError,
  EstadoInvalidoError,
  MotivoObrigatorioError,
} from './admin-errors';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'admin';

/** Bucket privado — mesma convenção de `estabelecimento-cadastro.supabase.ts#uploadFachada` (Story 3.5). */
const FACHADAS_BUCKET = 'fachadas';
/**
 * Bucket PÚBLICO `hubs` (Story 4.1, migration `20260812164200`) — diferente
 * de `fachadas`: a foto do hub é lida por URL pública direta, sem URL
 * assinada nem sessão (`docs/architecture/05-security.md §6.7`).
 */
const HUBS_BUCKET = 'hubs';
/** MIME types aceitos pelo bucket `hubs` (`allowed_mime_types`, migration `20260812164200`) — mesmo allowlist de `fachadas`. */
const HUB_FOTO_CONTENT_TYPE_BY_EXT: Record<HubFotoExt, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
/**
 * Expiração da URL assinada de fachada — curta, dentro da janela 5-60min de
 * `docs/architecture/05-security.md §6.7`. Gerada sob demanda no momento da
 * leitura (Admin), nunca persistida (ver JSDoc de
 * `EstabelecimentoCadastroPort.uploadFachada`).
 */
const FOTO_FACHADA_SIGNED_URL_EXPIRES_IN_SECONDS = 300;

const ESTABELECIMENTOS_ADMIN_COLUMNS =
  'id, nome_fantasia, cnpj, categoria, descricao, foto_fachada_url, endereco, lat, lng, ' +
  'raio_atendimento_km, tempo_medio_entrega_min, taxa_deslocamento_reais, ticket_minimo_reais, ' +
  'chave_pix, chave_pix_tipo, status, motivo_rejeicao, motivo_suspensao, pausado_manualmente, ' +
  'responsavel_nome, telefone, dados_receita, criado_em, aprovado_em, aprovado_por';

type EstabelecimentoAdminRow = {
  id: string;
  nome_fantasia: string;
  cnpj: string;
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
  chave_pix: string;
  chave_pix_tipo: string;
  status: string;
  motivo_rejeicao: string | null;
  motivo_suspensao: string | null;
  pausado_manualmente: boolean;
  responsavel_nome: string;
  telefone: string;
  dados_receita: Record<string, unknown> | null;
  criado_em: string;
  aprovado_em: string | null;
  aprovado_por: string | null;
};

type EstabelecimentoHorarioRow = {
  dia_semana: number;
  aberto: boolean;
  hora_abre: string | null;
  hora_fecha: string | null;
};

/**
 * Story 3.7 (AC2, AC3). `horarios` vem de uma query SEPARADA (não embed
 * tipado do PostgREST) — [AUTO-DECISION] reason: evita depender de metadata
 * de `Relationships` (FK) no `Database` reconciliado manualmente
 * (`@keepit/shared-types`, ver comentário de topo do arquivo), mantendo o
 * mapeamento simples e explícito. Escala do piloto não justifica a
 * sofisticação de um embed tipado para uma segunda query pequena.
 */
function mapRowToEstabelecimentoAdmin(
  row: EstabelecimentoAdminRow,
  horariosRows: EstabelecimentoHorarioRow[],
): EstabelecimentoAdmin {
  const horarios: EstabelecimentoHorario[] = [...horariosRows]
    .sort((a, b) => a.dia_semana - b.dia_semana)
    .map((h) => ({ dia_semana: h.dia_semana, aberto: h.aberto, hora_abre: h.hora_abre, hora_fecha: h.hora_fecha }));

  return {
    id: row.id,
    nome_fantasia: row.nome_fantasia,
    categoria: row.categoria,
    descricao: row.descricao,
    foto_fachada_url: row.foto_fachada_url,
    endereco: row.endereco,
    lat: row.lat,
    lng: row.lng,
    raio_atendimento_km: row.raio_atendimento_km,
    tempo_medio_entrega_min: row.tempo_medio_entrega_min,
    taxa_deslocamento_reais: row.taxa_deslocamento_reais,
    ticket_minimo_reais: row.ticket_minimo_reais,
    // `status`/`chave_pix_tipo` são `text` no banco (sem enum PostgreSQL) —
    // cast documentado, protegido pelo CHECK constraint da migration
    // (`20260812123046`/`20260812123048`), nunca validado de novo aqui.
    status: row.status as EstabelecimentoStatus,
    motivo_rejeicao: row.motivo_rejeicao,
    motivo_suspensao: row.motivo_suspensao,
    pausado_manualmente: row.pausado_manualmente,
    horarios,
    cnpj: row.cnpj,
    telefone: row.telefone,
    responsavel_nome: row.responsavel_nome,
    chave_pix: row.chave_pix,
    chave_pix_tipo: row.chave_pix_tipo as ChavePixTipoCadastro,
    dados_receita: row.dados_receita,
    criado_em: row.criado_em,
    aprovado_em: row.aprovado_em,
    aprovado_por: row.aprovado_por,
  };
}

/**
 * Stories 3.8/3.9. `aprovar_lojista`/`rejeitar_lojista` devolvem só o `uuid`
 * do estabelecimento mutado (`RETURNS uuid`, ver as duas migrations) — após
 * o sucesso da RPC, esta função relê a linha para devolver o
 * `Estabelecimento` real exigido pela assinatura de `AdminPort.approve`/
 * `reject`, nunca inventando o objeto de retorno a partir do `uuid` sozinho.
 * Reaproveita `mapRowToEstabelecimentoAdmin` (mesmo mapeamento de
 * `pendingStores`/`pendingStoreDetail`, Story 3.7).
 *
 * Cast documentado no `return`: `AdminPort.approve`/`reject` herdam a
 * assinatura `Promise<Estabelecimento>` (tipo de domínio da Descoberta,
 * `lat`/`lng`/`raio_atendimento_km` declarados `number` não-nulos), mas o
 * schema físico do piloto permite `null` nesses 3 campos (geo/raio adiados —
 * Story 3.4 `SIMPLE`) — mesma divergência já documentada no AUTO-DECISION de
 * `EstabelecimentoAdmin` (`ports/admin.port.ts`). `/aprovacoes/[id]` (única
 * chamadora real hoje) não consome o valor resolvido de `approve`/`reject` —
 * só o sucesso/falha da Promise — então o cast não vaza um dado inventado
 * para nenhuma tela; documentado aqui para não silenciar a divergência de
 * tipo para futuros consumidores.
 */
async function fetchEstabelecimentoAposMutacao(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<Estabelecimento> {
  const { data, error } = await supabase
    .from('estabelecimentos')
    .select(ESTABELECIMENTOS_ADMIN_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(
      `[core-data/supabase] admin — RPC concluiu com sucesso mas ${id} não foi encontrado na releitura (inesperado).`,
    );
  }
  const row = data as unknown as EstabelecimentoAdminRow;

  const { data: horariosData, error: horariosError } = await supabase
    .from('estabelecimentos_horarios')
    .select('dia_semana, aberto, hora_abre, hora_fecha')
    .eq('estabelecimento_id', id);
  if (horariosError) {
    throw horariosError;
  }

  const admin = mapRowToEstabelecimentoAdmin(row, (horariosData ?? []) as unknown as EstabelecimentoHorarioRow[]);
  return admin as unknown as Estabelecimento;
}

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

/** Story 4.1 (AC1, AC3, AC4). Mesmo formato de `mapRowToEstabelecimentoAdmin`, sem os campos administrativos que `hubs` não tem. */
function mapRowToHub(row: HubRow, horariosRows: HubHorarioRow[]): Hub {
  // Mapeamento explícito campo a campo (não spread) — mesmo padrão de
  // `mapRowToEstabelecimentoAdmin`, garante que nenhuma coluna extra (ex.:
  // `hub_id`, presente nas linhas cruas de `hubs_horarios`) vaze para o
  // `Hub` devolvido, mesmo que a query real algum dia selecione mais
  // colunas do que o esperado.
  const horarios: HubHorario[] = [...horariosRows]
    .sort((a, b) => a.dia_semana - b.dia_semana)
    .map((h) => ({ dia_semana: h.dia_semana, aberto: h.aberto, hora_abre: h.hora_abre, hora_fecha: h.hora_fecha }));

  return {
    id: row.id,
    nome: row.nome,
    endereco: row.endereco,
    lat: row.lat,
    lng: row.lng,
    ponto_referencia: row.ponto_referencia,
    foto_url: row.foto_url,
    ativo: row.ativo,
    horarios,
  };
}

/**
 * Busca `hubs_horarios` de um conjunto de ids numa única query (`.in(...)`)
 * — mesmo padrão de `fetchHorariosByEstabelecimentoIds`, evita N+1 quando
 * `hubsCrud.list` lista vários hubs de uma vez (AC1).
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
 * Story 4.1 (AC1, AC4). Releitura completa (hub + horários) por `id` — usada
 * por `hubsCrud.getById` diretamente e por `hubsCrud.update` após a escrita
 * (mesmo padrão "nunca ecoar o input, sempre reler o estado real persistido"
 * de `fetchMeuPerfilPorDono`/`fetchEstabelecimentoAposMutacao`). `.maybeSingle()`
 * — `null` honesto quando o `id` não existe (ou quando a RLS `publico_ve_hubs`
 * bloqueia por o hub estar inativo e o chamador não ser admin — indistinguível
 * por design, mesma postura de `store.getById`).
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
 * Esqueleto Supabase de `AdminPort` (Story 1.9). Ao contrário das demais
 * ports, `AdminPort` mistura responsabilidades de 3 épicos diferentes — o
 * `epicHint` de cada `NotImplementedError` reflete o épico do MÉTODO
 * específico (não um único hint fixo para o arquivo inteiro):
 * - `pendingStores`/`pendingStoreDetail` → implementados na Story 3.7;
 *   `approve`/`reject` → implementados nas Stories 3.8/3.9 (RPCs
 *   `aprovar_lojista`/`rejeitar_lojista`, `SECURITY DEFINER` + `is_admin()`)
 * - `hubsCrud.*` → implementado na Story 4.1 (cadastro de hubs, Épico 4)
 * - demais métodos (`refundQueue`, `listClientes`, `blockCliente`,
 *   `unblockCliente`, `listAllEstabelecimentos`, `suspendLojista`,
 *   `lojistaQualityView`, `financialDashboard`, `listAllOrders`,
 *   `forceCancelOrder`) → Épico 8 (Painel Admin — Operação)
 */
export function createAdminSupabase(client?: SupabaseClient<Database>): AdminPort {
  // [IDS] REUSE do padrão `resolveClient()` lazy/memoizado já usado em
  // `lojista-auth.supabase.ts`/`estabelecimento-cadastro.supabase.ts` — ao
  // contrário do esqueleto original deste arquivo (Story 1.9), `pendingStores`/
  // `pendingStoreDetail` (Story 3.7) agora fazem chamadas de rede de verdade,
  // então a instância precisa ser memoizada dentro do closure (não recriada a
  // cada chamada).
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  /**
   * Busca `estabelecimentos_horarios` de um conjunto de ids numa única
   * query (`.in(...)`) — evita N+1 quando `pendingStores` lista vários
   * lojistas pendentes de uma vez.
   */
  async function fetchHorariosByEstabelecimentoIds(
    ids: string[],
  ): Promise<Map<string, EstabelecimentoHorarioRow[]>> {
    const porEstabelecimento = new Map<string, EstabelecimentoHorarioRow[]>();
    if (ids.length === 0) {
      return porEstabelecimento;
    }

    const { data, error } = await resolveClient()
      .from('estabelecimentos_horarios')
      .select('estabelecimento_id, dia_semana, aberto, hora_abre, hora_fecha')
      .in('estabelecimento_id', ids);
    if (error) {
      throw error;
    }

    const rows = (data ?? []) as unknown as (EstabelecimentoHorarioRow & { estabelecimento_id: string })[];
    for (const row of rows) {
      const lista = porEstabelecimento.get(row.estabelecimento_id) ?? [];
      lista.push({ dia_semana: row.dia_semana, aberto: row.aberto, hora_abre: row.hora_abre, hora_fecha: row.hora_fecha });
      porEstabelecimento.set(row.estabelecimento_id, lista);
    }
    return porEstabelecimento;
  }

  return {
    /**
     * Story 3.7 (AC2, AC4). RLS `admin_gerencia_estab` (`is_admin()`) é a
     * ÚNICA barreira de autorização — este método não reimplementa a
     * checagem de admin no client: um usuário autenticado sem entrada em
     * `admin_users` simplesmente recebe `[]` (a policy filtra a query no
     * Postgres), nunca um erro nem um vazamento parcial. Ordena por
     * `criado_em` ascendente no client (mais antigo primeiro na fila) — sem
     * `.order()` do PostgREST para manter a chamada simples de mockar em
     * teste.
     */
    async pendingStores(_options?: AsyncCallOptions): Promise<EstabelecimentoAdmin[]> {
      const supabase = resolveClient();

      const { data, error } = await supabase
        .from('estabelecimentos')
        .select(ESTABELECIMENTOS_ADMIN_COLUMNS)
        .eq('status', 'em_analise');
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as unknown as EstabelecimentoAdminRow[];
      if (rows.length === 0) {
        return [];
      }

      const horariosPorEstabelecimento = await fetchHorariosByEstabelecimentoIds(rows.map((r) => r.id));

      return rows
        .map((row) => mapRowToEstabelecimentoAdmin(row, horariosPorEstabelecimento.get(row.id) ?? []))
        .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    },

    /**
     * Story 3.7 (AC3). `.maybeSingle()` — `null` honesto quando o `id` não
     * existe (ou quando RLS bloqueia, indistinguível por design — mesma
     * postura de `store.getById`), nunca um erro genérico disfarçando um
     * "não encontrado". Foto de fachada: só assina quando `foto_fachada_url`
     * está presente — nunca chama Storage para um path inexistente.
     *
     * [FIX REL-001, QA gate 3.7 FAIL] Degradação graciosa: se
     * `createSignedUrl` falhar (ex.: policy de storage ausente/RLS negando),
     * a foto vira `null` — o restante do detalhe (CNPJ, responsável, PIX,
     * horários, `dados_receita`) é retornado normalmente. Nunca lança por
     * causa da foto (era o bug que derrubava a tela inteira). Erros na
     * query principal de `estabelecimentos`/`estabelecimentos_horarios`
     * continuam propagando normalmente — só o passo de assinatura da foto é
     * tratado como não-fatal, honestidade preservada (sem foto → `null`,
     * nunca uma URL inventada).
     */
    async pendingStoreDetail(id: string, _options?: AsyncCallOptions): Promise<EstabelecimentoAdmin | null> {
      const supabase = resolveClient();

      const { data, error } = await supabase
        .from('estabelecimentos')
        .select(ESTABELECIMENTOS_ADMIN_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      const row = data as unknown as EstabelecimentoAdminRow;

      const { data: horariosData, error: horariosError } = await supabase
        .from('estabelecimentos_horarios')
        .select('dia_semana, aberto, hora_abre, hora_fecha')
        .eq('estabelecimento_id', id);
      if (horariosError) {
        throw horariosError;
      }

      const estabelecimentoAdmin = mapRowToEstabelecimentoAdmin(
        row,
        (horariosData ?? []) as unknown as EstabelecimentoHorarioRow[],
      );

      let fotoFachadaUrlAssinada: string | null = null;
      if (row.foto_fachada_url) {
        try {
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from(FACHADAS_BUCKET)
            .createSignedUrl(row.foto_fachada_url, FOTO_FACHADA_SIGNED_URL_EXPIRES_IN_SECONDS);
          fotoFachadaUrlAssinada = signedUrlError ? null : signedUrlData?.signedUrl ?? null;
        } catch {
          // [FIX REL-001] Falha ao assinar a foto (RLS de storage, rede,
          // etc.) nunca derruba o detalhe inteiro — degrada para `null`.
          fotoFachadaUrlAssinada = null;
        }
      }

      return { ...estabelecimentoAdmin, foto_fachada_url_assinada: fotoFachadaUrlAssinada };
    },

    /**
     * Story 3.8 (AC1-AC4). Chama a RPC `aprovar_lojista` (`SECURITY DEFINER`,
     * guardada por `is_admin()` — a autorização não é reimplementada aqui,
     * a RPC é a única barreira). `.rpc()` só resolve com sucesso quando a
     * transição `em_analise` → `ativo` de fato ocorreu no banco — não há
     * atualização otimista em lugar nenhum deste adapter: se a RPC falhar
     * (estado inválido, permissão, não encontrado, rede), a Promise rejeita
     * e `status` no banco permanece intocado (AC3). `aprovado_em`/
     * `aprovado_por` são gravados pela própria RPC (AC4) — este adapter não
     * escreve nenhuma coluna diretamente, só chama a função e relê o
     * resultado (`fetchEstabelecimentoAposMutacao`). Nenhuma chamada a
     * Asaas/hub — escopo `SIMPLE` desta Story.
     */
    async approve(estabelecimentoId: string, _options?: AsyncCallOptions): Promise<Estabelecimento> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('aprovar_lojista', { p_estab_id: estabelecimentoId });
      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError('aprovar_lojista');
        if (message.includes('ACESSO_NEGADO')) throw new AcessoNegadoError('aprovar_lojista');
        if (message.includes('ESTABELECIMENTO_NAO_ENCONTRADO')) {
          throw new EstabelecimentoNaoEncontradoError('aprovar_lojista');
        }
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError('aprovar_lojista');
        throw error;
      }
      if (!data) {
        throw new Error('[core-data/supabase] aprovar_lojista — RPC retornou vazio sem erro.');
      }

      return fetchEstabelecimentoAposMutacao(supabase, data);
    },

    /**
     * Story 3.9 (AC1-AC4). Chama a RPC `rejeitar_lojista` (`SECURITY
     * DEFINER`, guardada por `is_admin()`), passando `motivo` tal como
     * recebido — a tela (`/aprovacoes/[id]`) já faz `motivo.trim()` antes de
     * chamar `admin.reject` (validação client-side, Story 0.12); a RPC
     * valida de novo server-side (`MOTIVO_OBRIGATORIO`) e nunca confia
     * apenas no client (AC2). Mesma garantia de "sem atualização otimista"
     * do `approve`: `status`/`motivo_rejeicao` só existem no banco depois do
     * sucesso real da RPC (AC3); qualquer erro rejeita a Promise sem mutar
     * nada. Sem push/e-mail — fora do escopo desta Story (AC4).
     */
    async reject(estabelecimentoId: string, motivo: string, _options?: AsyncCallOptions): Promise<Estabelecimento> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('rejeitar_lojista', {
        p_estab_id: estabelecimentoId,
        p_motivo: motivo,
      });
      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError('rejeitar_lojista');
        if (message.includes('ACESSO_NEGADO')) throw new AcessoNegadoError('rejeitar_lojista');
        if (message.includes('MOTIVO_OBRIGATORIO')) throw new MotivoObrigatorioError();
        if (message.includes('ESTABELECIMENTO_NAO_ENCONTRADO')) {
          throw new EstabelecimentoNaoEncontradoError('rejeitar_lojista');
        }
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError('rejeitar_lojista');
        throw error;
      }
      if (!data) {
        throw new Error('[core-data/supabase] rejeitar_lojista — RPC retornou vazio sem erro.');
      }

      return fetchEstabelecimentoAposMutacao(supabase, data);
    },

    hubsCrud: {
      /**
       * Story 4.1 (AC1). RLS `publico_ve_hubs` (`ativo = true OR is_admin()`)
       * + `admin_gerencia_hubs` (`ALL is_admin()`) são policies PERMISSIVAS
       * que se somam (OR) — um admin autenticado recebe TODOS os hubs
       * (ativos e inativos) sem nenhum filtro de `ativo` no client; um
       * usuário autenticado sem entrada em `admin_users` recebe só os
       * ativos (nunca um erro, a RLS filtra a query no Postgres). Ordena
       * por `nome` no servidor (`.order()`) — lista estável para o Admin.
       */
      async list(_options?: AsyncCallOptions): Promise<Hub[]> {
        const supabase = resolveClient();

        const { data, error } = await supabase.from('hubs').select(HUB_COLUMNS).order('nome', { ascending: true });
        if (error) {
          throw error;
        }
        const rows = (data ?? []) as unknown as HubRow[];
        if (rows.length === 0) {
          return [];
        }

        const horariosPorHub = await fetchHorariosByHubIds(supabase, rows.map((r) => r.id));

        return rows.map((row) => mapRowToHub(row, horariosPorHub.get(row.id) ?? []));
      },

      /** Story 4.1 (AC1, AC4) — `/hubs/[id]` religa a edição a um hub que pode estar inativo. */
      async getById(id: string, _options?: AsyncCallOptions): Promise<Hub | null> {
        return fetchHubById(resolveClient(), id);
      },

      /**
       * Story 4.1 (AC2, AC3). `INSERT` em `hubs` (guardado por
       * `admin_gerencia_hubs`, `is_admin()`) seguido de `INSERT` das linhas
       * de `hubs_horarios` recebidas — sem uma RPC atômica dedicada
       * (nenhuma foi criada por @data-engineer para esta Story, diferente
       * de `criar_estabelecimento_completo`/Story 3.5; escala do piloto —
       * "poucos hubs", classificação SIMPLE — não justificou uma RPC só
       * para 2 INSERTs sequenciais). Se o INSERT de `hubs` tiver sucesso mas
       * o de `hubs_horarios` falhar, o hub fica temporariamente sem
       * horários — limitação conhecida e documentada, não uma escrita
       * atômica; qualquer erro rejeita a Promise sem sucesso fictício. O
       * `Hub` devolvido compõe a linha real do INSERT com `input.horarios`
       * (não uma releitura) — honesto porque `input.horarios` é EXATAMENTE
       * o que acabou de ser persistido com sucesso (o `INSERT` de
       * `hubs_horarios` só retorna sem erro se as 0..N linhas gravaram).
       */
      async create(input: CreateHubInput, _options?: AsyncCallOptions): Promise<Hub> {
        const supabase = resolveClient();

        const { data, error } = await supabase
          .from('hubs')
          .insert({
            nome: input.nome,
            endereco: input.endereco,
            lat: input.lat,
            lng: input.lng,
            ponto_referencia: input.ponto_referencia ?? null,
            foto_url: input.foto_url ?? null,
          })
          .select(HUB_COLUMNS)
          .single();
        if (error) {
          throw error;
        }
        if (!data) {
          throw new Error(
            '[core-data/supabase] hubsCrud.create — INSERT concluiu com sucesso mas não retornou a linha (inesperado).',
          );
        }
        const row = data as unknown as HubRow;

        if (input.horarios.length > 0) {
          const { error: horariosError } = await supabase.from('hubs_horarios').insert(
            input.horarios.map((h) => ({
              hub_id: row.id,
              dia_semana: h.dia_semana,
              aberto: h.aberto,
              hora_abre: h.hora_abre,
              hora_fecha: h.hora_fecha,
            })),
          );
          if (horariosError) {
            throw horariosError;
          }
        }

        return mapRowToHub(row, input.horarios);
      },

      /**
       * Story 4.1 (AC1, AC4). `UPDATE` parcial em `hubs` (só as colunas
       * presentes em `input`, mesma convenção de `atualizarMeuPerfil`) +
       * substituição total de `hubs_horarios` quando `input.horarios` é
       * informado (`DELETE` + `INSERT` — mais simples que um diff linha a
       * linha para no máximo 7 linhas por hub). Cobre também o caminho
       * "Excluir" da UI (`ativo: false`, Story 0.12) e a reativação
       * (`ativo: true`, AC1/AC4 desta Story) — o MESMO método, sem
       * distinção especial: um `UPDATE` de `ativo` é só mais um campo do
       * patch. Sempre relê o estado real após a escrita
       * (`fetchHubById`) — nunca ecoa o `input` de volta.
       */
      async update(id: string, input: UpdateHubInput, _options?: AsyncCallOptions): Promise<Hub> {
        const supabase = resolveClient();

        const patch: Database['public']['Tables']['hubs']['Update'] = {};
        if (input.nome !== undefined) patch.nome = input.nome;
        if (input.endereco !== undefined) patch.endereco = input.endereco;
        if (input.lat !== undefined) patch.lat = input.lat;
        if (input.lng !== undefined) patch.lng = input.lng;
        if (input.ponto_referencia !== undefined) patch.ponto_referencia = input.ponto_referencia;
        if (input.foto_url !== undefined) patch.foto_url = input.foto_url;
        if (input.ativo !== undefined) patch.ativo = input.ativo;

        if (Object.keys(patch).length > 0) {
          const { error } = await supabase.from('hubs').update(patch).eq('id', id);
          if (error) {
            throw error;
          }
        }

        if (input.horarios !== undefined) {
          const { error: deleteError } = await supabase.from('hubs_horarios').delete().eq('hub_id', id);
          if (deleteError) {
            throw deleteError;
          }
          if (input.horarios.length > 0) {
            const { error: insertError } = await supabase.from('hubs_horarios').insert(
              input.horarios.map((h) => ({
                hub_id: id,
                dia_semana: h.dia_semana,
                aberto: h.aberto,
                hora_abre: h.hora_abre,
                hora_fecha: h.hora_fecha,
              })),
            );
            if (insertError) {
              throw insertError;
            }
          }
        }

        const updated = await fetchHubById(supabase, id);
        if (!updated) {
          throw new Error(
            '[core-data/supabase] hubsCrud.update — UPDATE concluiu com sucesso mas a releitura não encontrou o hub (inesperado).',
          );
        }
        return updated;
      },

      /**
       * Story 4.1 (Dependencies — reconciliação de "excluir" com
       * `pedidos.hub_id ON DELETE RESTRICT`). NÃO é o caminho principal da
       * UI (que usa `update(id, { ativo: false })`, Story 0.12) — mas
       * implementado de verdade (não um stub) porque a port o declara: se
       * chamado com um hub referenciado por algum pedido histórico, o
       * `DELETE` falha pela FK e a Promise rejeita honestamente (sem
       * capturar/traduzir o erro de FK — propaga tal como o SDK devolve).
       */
      async delete(id: string, _options?: AsyncCallOptions): Promise<void> {
        const supabase = resolveClient();
        const { error } = await supabase.from('hubs').delete().eq('id', id);
        if (error) {
          throw error;
        }
      },

      /**
       * Story 4.1 (AC2, AC6). Upload para o bucket PÚBLICO `hubs`
       * (`admin_gerencia_hubs`-equivalente em `storage.objects`, migration
       * `20260812164200` — `is_admin()` guarda INSERT/UPDATE/DELETE).
       * `path` é um `crypto.randomUUID()` FLAT (sem pasta por usuário, ao
       * contrário de `fachadas`/`${uid}/fachada.<ext>`) — o bucket é público
       * e não há convenção de "dono" por hub que exija escopo de pasta.
       * `upsert: true` por paridade com `uploadFachada`, embora o path
       * aleatório nunca colida na prática. Retorna a URL PÚBLICA via
       * `getPublicUrl` (síncrono no SDK, sem chamada de rede adicional) —
       * NUNCA uma URL assinada (ver JSDoc de `AdminPort.hubsCrud.uploadFoto`).
       */
      async uploadFoto(input: HubFotoUploadInput, _options?: AsyncCallOptions): Promise<string> {
        const supabase = resolveClient();

        const response = await fetch(input.uri);
        const blob = await response.blob();
        const path = `${crypto.randomUUID()}.${input.ext}`;

        const { error: uploadError } = await supabase.storage.from(HUBS_BUCKET).upload(path, blob, {
          contentType: HUB_FOTO_CONTENT_TYPE_BY_EXT[input.ext],
          upsert: true,
        });
        if (uploadError) {
          throw uploadError;
        }

        const { data } = supabase.storage.from(HUBS_BUCKET).getPublicUrl(path);
        return data.publicUrl;
      },
    },

    refundQueue: {
      async list(_options?: AsyncCallOptions): Promise<ReembolsoPendente[]> {
        throw new NotImplementedError(PORT, 'refundQueue.list', 'Épico 8');
      },

      async process(_id: string, _options?: AsyncCallOptions): Promise<ReembolsoPendente> {
        throw new NotImplementedError(PORT, 'refundQueue.process', 'Épico 8');
      },
    },

    async listClientes(
      _filtros?: { busca?: string },
      _options?: AsyncCallOptions,
    ): Promise<Cliente[]> {
      throw new NotImplementedError(PORT, 'listClientes', 'Épico 8');
    },

    async blockCliente(_clienteId: string, _motivo: string, _options?: AsyncCallOptions): Promise<Cliente> {
      throw new NotImplementedError(PORT, 'blockCliente', 'Épico 8');
    },

    async unblockCliente(_clienteId: string, _options?: AsyncCallOptions): Promise<Cliente> {
      throw new NotImplementedError(PORT, 'unblockCliente', 'Épico 8');
    },

    async listAllEstabelecimentos(_options?: AsyncCallOptions): Promise<Estabelecimento[]> {
      throw new NotImplementedError(PORT, 'listAllEstabelecimentos', 'Épico 8');
    },

    async suspendLojista(
      _estabelecimentoId: string,
      _motivo: string,
      _options?: AsyncCallOptions,
    ): Promise<Estabelecimento> {
      throw new NotImplementedError(PORT, 'suspendLojista', 'Épico 8');
    },

    async lojistaQualityView(
      _estabelecimentoId: string,
      _options?: AsyncCallOptions,
    ): Promise<EstabelecimentoFalha[]> {
      throw new NotImplementedError(PORT, 'lojistaQualityView', 'Épico 8');
    },

    async financialDashboard(_periodoDias: number, _options?: AsyncCallOptions): Promise<FinancialDashboardResult> {
      throw new NotImplementedError(PORT, 'financialDashboard', 'Épico 8');
    },

    async listAllOrders(
      _filtros?: { status?: PedidoStatus },
      _options?: AsyncCallOptions,
    ): Promise<Pedido[]> {
      throw new NotImplementedError(PORT, 'listAllOrders', 'Épico 8');
    },

    async forceCancelOrder(_pedidoId: string, _motivo: string, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'forceCancelOrder', 'Épico 8');
    },
  };
}
