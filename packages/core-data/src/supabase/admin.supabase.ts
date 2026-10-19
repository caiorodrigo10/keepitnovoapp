import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  AdminPort,
  AdminPaymentInspection,
  ChargebackDecisionAdmin,
  CreateHubInput,
  EstabelecimentoAdmin,
  EstabelecimentoFalha,
  EstabelecimentoFalhaTipo,
  FinancialDashboardResult,
  FinancialPendingAdmin,
  FinancialRankingEntry,
  PaymentReconciliationAdmin,
  PaymentEventAdmin,
  PaymentOccurrenceAdmin,
  ReceivableAnticipationAdmin,
  HubFotoExt,
  HubFotoUploadInput,
  LancamentoConfirmResultado,
  ReembolsoMotivo,
  ReembolsoPendente,
  ReembolsoStatus,
  UpdateHubInput,
} from '../ports/admin.port';
import type { ChavePixTipoCadastro } from '../ports/estabelecimento-cadastro.port';
import type { Cliente } from '../ports/auth.port';
import type { Hub, HubHorario } from '../ports/hub.port';
import type { FormaPagamento, Pedido, PedidoStatus } from '../ports/order.port';
import type { Estabelecimento, EstabelecimentoHorario, EstabelecimentoStatus } from '../ports/store.port';
import type { Saque } from '../ports/wallet.port';
import type { AsyncCallOptions } from '../types';
import { createSupportOperationId } from '../support-operation-id';
import { calculateFinancialOverview } from './financialOverview';
import {
  AcessoNegadoError,
  AutenticacaoNecessariaError,
  ClienteNaoEncontradoError,
  EstabelecimentoNaoEncontradoError,
  EstadoInvalidoError,
  MotivoObrigatorioError,
  NaoAutorizadoError,
  PedidoNaoEncontradoError,
} from './admin-errors';
import { mapRowToEstabelecimento, type EstabelecimentoRow } from './store.supabase';
import { fetchItensPorPedidoIds, fetchPedidoPorId, mapRowToPedido, PEDIDO_COLUMNS, type PedidoRow } from './order.supabase';
import { LANCAMENTO_COLUMNS, mapLancamentoToSaque, type LancamentoRow } from './wallet.supabase';

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

type OperationalQueryResult = { data: unknown; error: unknown };
interface OperationalQuery extends PromiseLike<OperationalQueryResult> {
  select(columns: string): OperationalQuery;
  eq(column: string, value: unknown): OperationalQuery;
  in(column: string, values: unknown[]): OperationalQuery;
  not(column: string, operator: string, value: unknown): OperationalQuery;
  order(column: string, options?: { ascending?: boolean }): OperationalQuery;
  limit(count: number): OperationalQuery;
  range(from: number, to: number): OperationalQuery;
}
interface OperationalReadClient {
  from(table: string): OperationalQuery;
}

const OPERATIONAL_PAGE_SIZE = 1_000;

async function fetchAllOperationalRows<T>(
  queryPage: (from: number, to: number) => OperationalQuery,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += OPERATIONAL_PAGE_SIZE) {
    const result = await queryPage(from, from + OPERATIONAL_PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as T[];
    rows.push(...page);
    if (page.length < OPERATIONAL_PAGE_SIZE) return rows;
  }
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

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
  excluido_em: string | null;
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
    excluido_em: row.excluido_em,
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
    hub_ids: [],
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
  const { data: privateRows, error } = await supabase.rpc('obter_estabelecimentos_privados', { p_id: id });
  const data = privateRows?.[0] ?? null;
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

// =============================================================================
// Bloco 09 (Épico 8 — Operação Admin) — helpers de módulo. `resolveClient`
// local do `createAdminSupabase` NÃO está disponível aqui (é fechado dentro
// da factory) — cada helper recebe `supabase` explicitamente, mesmo padrão
// já usado por `fetchEstabelecimentoAposMutacao`/`fetchHubById` acima.
// =============================================================================

/** Mapeia `lancamentos_financeiros.status` (3 valores) → `ReembolsoStatus` (4 valores, UI) — Story 8.1. `em_processamento` nunca é produzido por leitura (estado otimista client-side durante a RPC, ver Story 8.1 Dependencies item 1). */
const REFUND_STATUS_MAP: Record<string, ReembolsoStatus> = {
  pendente: 'pendente_admin',
  concluido: 'estornado',
  erro: 'erro',
};

const CLIENTE_COLUMNS = 'id, nome, telefone, cpf, bloqueado, motivo_bloqueio, criado_em';

type ClienteRow = {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  bloqueado: boolean;
  motivo_bloqueio: string | null;
  criado_em: string;
};

type UserIdRow = { id: string };
type EstabelecimentoOwnerRow = { dono_user_id: string | null };

function mapRowToCliente(row: ClienteRow): Cliente {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone,
    cpf: row.cpf,
    bloqueado: row.bloqueado,
    motivo_bloqueio: row.motivo_bloqueio,
    criado_em: row.criado_em,
  };
}

async function fetchClientePorId(supabase: SupabaseClient<Database>, id: string): Promise<Cliente> {
  const { data, error } = await supabase.from('clientes').select(CLIENTE_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(
      `[core-data/supabase] admin — RPC de (des)bloqueio concluiu com sucesso mas cliente ${id} não foi encontrado na releitura (inesperado).`,
    );
  }
  return mapRowToCliente(data as unknown as ClienteRow);
}

/**
 * Colunas cruas de `lancamentos_financeiros` para as leituras administrativas
 * de reembolso/saque (Stories 8.1/8.9) — superset de `LANCAMENTO_COLUMNS`
 * (`wallet.supabase.ts`, sem `pedido_id`/`tipo`/`detalhe`, que o ângulo do
 * lojista não precisa) com os 3 campos que o ângulo ADMIN precisa para
 * reconstruir `ReembolsoPendente` (join com `pedidos.forma_pagamento`) e
 * distinguir `tipo` na leitura mista.
 */
const LANCAMENTO_ADMIN_COLUMNS =
  'id, estabelecimento_id, pedido_id, tipo, valor_centavos, status, criado_em, concluido_em, detalhe, motivo_reembolso, responsavel_reembolso, solicitacao_id, asaas_id_externo, estado_reserva';

type LancamentoAdminRow = {
  id: string;
  estabelecimento_id: string;
  pedido_id: string | null;
  tipo: string;
  valor_centavos: number;
  status: string;
  criado_em: string;
  concluido_em: string | null;
  detalhe: string | null;
  motivo_reembolso?: string | null;
  responsavel_reembolso?: 'keepit' | 'lojista' | null;
  solicitacao_id?: string | null;
  asaas_id_externo?: string | null;
  estado_reserva?: 'ativa' | 'liberada';
};

type ChargebackDecisionRow = {
  id: string;
  ocorrencia_id: string;
  responsavel_principal: ChargebackDecisionAdmin['responsavelPrincipal'];
  motivo: string;
  referencia: string;
  principal_informado_centavos: number;
  principal_debitado_centavos: number;
  taxa_centavos: number;
  lancamento_id: string;
  criado_em: string;
};

function mapChargebackDecision(row: ChargebackDecisionRow): ChargebackDecisionAdmin {
  return {
    id: row.id,
    ocorrenciaId: row.ocorrencia_id,
    responsavelPrincipal: row.responsavel_principal,
    motivo: row.motivo,
    referencia: row.referencia,
    principalInformadoCentavos: row.principal_informado_centavos,
    principalDebitadoCentavos: row.principal_debitado_centavos,
    taxaCentavos: row.taxa_centavos,
    lancamentoId: row.lancamento_id,
    criadoEm: row.criado_em,
  };
}

/**
 * Story 8.1 (AC2, AC4, AC6) — reconcilia um lançamento `tipo='refund'` real
 * para o contrato de UI `ReembolsoPendente` ("modelo-alvo" pré-Bloco-08,
 * preservado — ver Story 8.1 "Conflito de arquitetura resolvido"). Segue o
 * mesmo precedente de `wallet.supabase.ts#mapLancamentoToSaque` (conversão
 * centavos→reais, status honesto nunca inventado).
 *
 * Task 9 grava motivo, responsabilidade, caso e referência no próprio
 * lançamento. Linhas anteriores à migração recebem o motivo legado de
 * cancelamento administrativo; `valor_ao_lojista_reais` permanece zero pois
 * o ajuste de responsabilidade é lançado separadamente na confirmação.
 */
function mapLancamentoRowToReembolsoPendente(row: LancamentoAdminRow, formaPagamento: FormaPagamento | null): ReembolsoPendente {
  const motivo = (row.motivo_reembolso ?? 'cancelamento_admin') as ReembolsoMotivo;
  return {
    id: row.id,
    pedido_id: row.pedido_id,
    motivo,
    valor_a_estornar_reais: Math.abs(row.valor_centavos) / 100,
    valor_ao_lojista_reais: 0,
    forma_pagamento: formaPagamento,
    status: REFUND_STATUS_MAP[row.status] ?? 'erro',
    criado_em: row.criado_em,
    caso_id: row.solicitacao_id ?? null,
    responsavel: row.responsavel_reembolso ?? null,
    referencia_externa: row.asaas_id_externo ?? null,
    estado_reserva: row.estado_reserva ?? 'ativa',
  };
}

/**
 * Busca `pedidos.forma_pagamento` em lotes de IDs deduplicados para os
 * `pedido_id` de lançamentos `refund`, evitando N+1 e URLs excessivas no
 * PostgREST.
 */
async function fetchFormaPagamentoPorPedidoIds(
  supabase: SupabaseClient<Database>,
  pedidoIds: string[],
): Promise<Map<string, FormaPagamento>> {
  const mapa = new Map<string, FormaPagamento>();
  if (pedidoIds.length === 0) {
    return mapa;
  }
  for (const pedidoIdChunk of chunks([...new Set(pedidoIds)], 100)) {
    const { data, error } = await supabase.from('pedidos').select('id, forma_pagamento').in('id', pedidoIdChunk);
    if (error) {
      throw error;
    }
    for (const row of (data ?? []) as unknown as { id: string; forma_pagamento: string }[]) {
      mapa.set(row.id, row.forma_pagamento as FormaPagamento);
    }
  }
  return mapa;
}

/**
 * Releitura de UM lançamento por `id` (`LANCAMENTO_ADMIN_COLUMNS`) — usada
 * após o sucesso de `confirmar_lancamento_admin` (a RPC devolve só
 * `lancamento_id/tipo/status/ator_admin_id/concluido_em`, sem
 * `valor_centavos`/`pedido_id`/`estabelecimento_id`, insuficiente para
 * reconstruir `ReembolsoPendente`/`Saque`) — mesmo princípio de "nunca ecoar
 * o input, sempre reler o estado real persistido" já usado em
 * `fetchEstabelecimentoAposMutacao`.
 */
async function fetchLancamentoAdminPorId(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<LancamentoAdminRow> {
  const { data, error } = await supabase
    .from('lancamentos_financeiros')
    .select(LANCAMENTO_ADMIN_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(
      `[core-data/supabase] admin — confirmar_lancamento_admin concluiu com sucesso mas o lançamento ${id} não foi encontrado na releitura (inesperado).`,
    );
  }
  return data as unknown as LancamentoAdminRow;
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
 * - demais métodos (`refundQueue`, `payoutQueue`, `listClientes`,
 *   `blockCliente`, `unblockCliente`, `listAllEstabelecimentos`,
 *   `suspendLojista`, `reactivateLojista`, `lojistaQualityView`,
 *   `lojistaOrderCounts`, `financialDashboard`, `listAllOrders`,
 *   `forceCancelOrder`) → Bloco 09, Épico 8 (Painel Admin — Operação)
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
    /** A RPC valida Admin no banco; a fila mantém somente lojas em análise. */
    async pendingStores(_options?: AsyncCallOptions): Promise<EstabelecimentoAdmin[]> {
      const supabase = resolveClient();

      const { data: privateRows, error } = await supabase.rpc('obter_estabelecimentos_privados', { p_id: null });
      const data = privateRows?.filter((row) => row.status === 'em_analise');
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

    /** Detalhe privado autorizado pela RPC; foto assinada sob demanda. */
    async pendingStoreDetail(id: string, _options?: AsyncCallOptions): Promise<EstabelecimentoAdmin | null> {
      const supabase = resolveClient();

      const { data: privateRows, error } = await supabase.rpc('obter_estabelecimentos_privados', { p_id: id });
      const data = privateRows?.[0] ?? null;
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

      const { data: vinculosData, error: vinculosError } = await supabase
        .from('estabelecimentos_hubs')
        .select('hub_id')
        .eq('estabelecimento_id', id);
      if (vinculosError) {
        throw vinculosError;
      }
      estabelecimentoAdmin.hub_ids = ((vinculosData ?? []) as unknown as Array<{ hub_id: string }>).map(
        (vinculo) => vinculo.hub_id,
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

    async aprovarComHubs(input, _options?: AsyncCallOptions): Promise<void> {
      const { error } = await resolveClient().rpc('aprovar_lojista_com_hubs', {
        p_estabelecimento_id: input.estabelecimentoId,
        p_hub_ids: input.hubIds,
        p_operacao_id: input.operacaoId,
      });
      if (error) throw error;
    },

    async definirHubs(input, _options?: AsyncCallOptions): Promise<void> {
      const { error } = await resolveClient().rpc('definir_hubs_lojista', {
        p_estabelecimento_id: input.estabelecimentoId,
        p_hub_ids: input.hubIds,
        p_operacao_id: input.operacaoId,
      });
      if (error) throw error;
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
      /**
       * Story 8.1 (AC1, AC2, AC4, AC5). `lancamentos_financeiros WHERE
       * tipo='refund'`, ordenado por `criado_em ASC` (espelha
       * `idx_lancamentos_pendentes`). RLS `le_ve_relacionados`
       * (`is_admin() OR estabelecimento_id = meu_estabelecimento_id()`) já
       * cobre a leitura administrativa (nenhuma policy nova) — um
       * autenticado sem `admin_users` só veria os do próprio
       * estabelecimento, nunca um erro. O schema permite `pedido_id NULL`;
       * essas linhas permanecem visíveis e tratáveis sem inventar vínculo.
       */
      async list(_options?: AsyncCallOptions): Promise<ReembolsoPendente[]> {
        const supabase = resolveClient();
        const operational = supabase as unknown as OperationalReadClient;

        const rows = (await fetchAllOperationalRows<LancamentoAdminRow>((from, to) => operational
          .from('lancamentos_financeiros')
          .select(LANCAMENTO_ADMIN_COLUMNS)
          .eq('tipo', 'refund')
          .order('criado_em', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)))
          .filter((row) => row.estado_reserva !== 'liberada');
        if (rows.length === 0) {
          return [];
        }

        const formaPagamentoPorPedido = await fetchFormaPagamentoPorPedidoIds(
          supabase,
          rows.map((r) => r.pedido_id).filter((pedidoId): pedidoId is string => pedidoId !== null),
        );

        return rows.map((row) =>
          mapLancamentoRowToReembolsoPendente(row, formaPagamentoPorPedido.get(row.pedido_id ?? '') ?? null),
        );
      },

      /** Registra execução ou falha externa; a RPC mantém a mesma reserva e aplica responsabilidade uma vez. */
      async process(
        id: string,
        resultado: LancamentoConfirmResultado,
        detalhe?: string,
        _options?: AsyncCallOptions,
      ): Promise<ReembolsoPendente> {
        const supabase = resolveClient();

        if (!detalhe?.trim()) throw new Error(resultado === 'concluido' ? 'REFERENCIA_OBRIGATORIA' : 'DETALHE_OBRIGATORIO');
        const { error } = await supabase.rpc('registrar_execucao_reembolso' as never, {
          p_lancamento_id: id,
          p_resultado: resultado,
          p_referencia: resultado === 'concluido' ? detalhe.trim() : null,
          p_operacao_id: createSupportOperationId(),
          p_detalhe: resultado === 'erro' ? detalhe.trim() : null,
        } as never);
        if (error) {
          throw new Error(error.message ?? 'REEMBOLSO_FALHOU');
        }

        const row = await fetchLancamentoAdminPorId(supabase, id);
        const formaPagamentoPorPedido = await fetchFormaPagamentoPorPedidoIds(
          supabase,
          row.pedido_id ? [row.pedido_id] : [],
        );
        return mapLancamentoRowToReembolsoPendente(row, formaPagamentoPorPedido.get(row.pedido_id ?? '') ?? null);
      },
      async reopen(id: string, comprovacao: string): Promise<void> {
        const { error } = await resolveClient().rpc('reabrir_execucao_reembolso' as never, {
          p_lancamento_id: id, p_comprovacao: comprovacao, p_operacao_id: createSupportOperationId(),
        } as never);
        if (error) throw error;
      },
      async release(id: string, comprovacao: string): Promise<void> {
        const { error } = await resolveClient().rpc('liberar_reserva_reembolso' as never, {
          p_lancamento_id: id, p_comprovacao: comprovacao, p_operacao_id: createSupportOperationId(),
        } as never);
        if (error) throw error;
      },
    },

    payoutQueue: {
      /**
       * Story 8.9 (AC1, AC2). `lancamentos_financeiros WHERE tipo='payout'
       * AND status='pendente'`, ordenado por `criado_em ASC` — mesma leitura
       * de `wallet.supabase.ts#statement`, ângulo administrativo (todos os
       * estabelecimentos, não filtrado por 1 dono). [IDS] REUSE de
       * `mapLancamentoToSaque` (`wallet.supabase.ts`) — mesmo mapeamento
       * centavos→reais/status já validado pelo Bloco 08.
       */
      async list(_options?: AsyncCallOptions): Promise<Saque[]> {
        const supabase = resolveClient();

        const { data, error } = await supabase
          .from('lancamentos_financeiros')
          .select(LANCAMENTO_COLUMNS)
          .eq('tipo', 'payout')
          .eq('status', 'pendente')
          .order('criado_em', { ascending: true });
        if (error) {
          throw error;
        }

        const rows = (data ?? []) as unknown as LancamentoRow[];
        return rows.map(mapLancamentoToSaque);
      },

      /** Saque avulso legado é somente histórico; repasses usam `PayoutPort`. */
      async process(
        _id: string,
        _resultado: LancamentoConfirmResultado,
        _detalhe?: string,
        _options?: AsyncCallOptions,
      ): Promise<Saque> {
        throw new Error('SAQUES_DESATIVADOS_USE_REPASSE_SEMANAL');
      },
    },

    /**
     * Story 8.5 (AC1). RLS `admin_gerencia_clientes` (`FOR ALL,
     * is_admin()`) já concede SELECT de todos os clientes ao admin (OR'd
     * com `cliente_le_proprio`) — não-admin recebe só a própria linha,
     * nunca erro. Busca (nome/telefone) via `.or()` `ilike` — mesmo
     * subconjunto já coberto pelo mock (e-mail/CPF são débito não-bloqueante,
     * ver Story 8.5 Validação PO).
     */
    async listClientes(filtros?: { busca?: string }, _options?: AsyncCallOptions): Promise<Cliente[]> {
      const supabase = resolveClient();

      let query = supabase.from('clientes').select(CLIENTE_COLUMNS);
      const busca = filtros?.busca?.trim();
      if (busca) {
        const termo = busca.replace(/[%_]/g, '');
        query = query.or(`nome.ilike.%${termo}%,telefone.ilike.%${termo}%`);
      }

      const [clientesResponse, adminsResponse, estabelecimentosResponse] = await Promise.all([
        query,
        supabase.from('admin_users').select('id'),
        supabase.from('estabelecimentos').select('dono_user_id'),
      ]);
      if (clientesResponse.error) {
        throw clientesResponse.error;
      }
      if (adminsResponse.error) {
        throw adminsResponse.error;
      }
      if (estabelecimentosResponse.error) {
        throw estabelecimentosResponse.error;
      }

      const excludedIds = new Set([
        ...((adminsResponse.data ?? []) as unknown as UserIdRow[]).map((admin) => admin.id),
        ...((estabelecimentosResponse.data ?? []) as unknown as EstabelecimentoOwnerRow[])
          .map((estabelecimento) => estabelecimento.dono_user_id)
          .filter((ownerId): ownerId is string => ownerId !== null),
      ]);
      return ((clientesResponse.data ?? []) as unknown as ClienteRow[])
        .filter((cliente) => !excludedIds.has(cliente.id))
        .map(mapRowToCliente);
    },

    /**
     * Story 8.5 (AC3). RPC `bloquear_cliente` (`SECURITY DEFINER` +
     * `is_admin()` + trigger anti-self-unblock — ver migration
     * `20260813070002`). Releitura completa pós-RPC (a RPC devolve só
     * `cliente_id/bloqueado/bloqueado_em`).
     */
    async blockCliente(clienteId: string, motivo: string, _options?: AsyncCallOptions): Promise<Cliente> {
      const supabase = resolveClient();

      const { error } = await supabase.rpc('bloquear_cliente', { p_cliente_id: clienteId, p_motivo: motivo });
      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError('bloquear_cliente');
        if (message.includes('NAO_AUTORIZADO')) throw new NaoAutorizadoError('bloquear_cliente');
        if (message.includes('MOTIVO_OBRIGATORIO')) throw new MotivoObrigatorioError('bloquear_cliente');
        if (message.includes('CLIENTE_NAO_ENCONTRADO')) throw new ClienteNaoEncontradoError('bloquear_cliente');
        throw error;
      }

      return fetchClientePorId(supabase, clienteId);
    },

    /** Story 8.5 (AC5). RPC `desbloquear_cliente` — par de `blockCliente`. */
    async unblockCliente(clienteId: string, _options?: AsyncCallOptions): Promise<Cliente> {
      const supabase = resolveClient();

      const { error } = await supabase.rpc('desbloquear_cliente', { p_cliente_id: clienteId });
      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError('desbloquear_cliente');
        if (message.includes('NAO_AUTORIZADO')) throw new NaoAutorizadoError('desbloquear_cliente');
        if (message.includes('CLIENTE_NAO_ENCONTRADO')) throw new ClienteNaoEncontradoError('desbloquear_cliente');
        throw error;
      }

      return fetchClientePorId(supabase, clienteId);
    },

    /**
     * Story 8.3/8.6/8.8 dependem deste método para resolver nome de
     * loja/hub em listagens administrativas. [IDS] REUSE de
     * `mapRowToEstabelecimento`/`fetchHorarios`
     * (`store.supabase.ts`) — SEM filtro de `status` (o admin precisa ver
     * TODOS, inclusive suspensos/em análise/rejeitados), ao contrário da
     * Descoberta pública.
     */
    async listAllEstabelecimentos(_options?: AsyncCallOptions): Promise<Estabelecimento[]> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('obter_estabelecimentos_privados', { p_id: null });
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as unknown as EstabelecimentoRow[];
      if (rows.length === 0) {
        return [];
      }

      const horariosPorEstabelecimento = await fetchHorariosByEstabelecimentoIds(rows.map((r) => r.id));
      return rows
        .map((row) => mapRowToEstabelecimento(row, horariosPorEstabelecimento.get(row.id) ?? []))
        .sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia));
    },

    /**
     * Story 8.6 (AC1, AC2, AC3). RPC `suspender_lojista` (`SECURITY
     * DEFINER` + `is_admin()`, guarda `status='ativo'` — mesma guarda já
     * presente no mock). Catálogo público já filtra `status='ativo'`
     * (`publico_ve_ativos`) — some do catálogo é efeito estrutural, nenhum
     * código novo aqui. Pedidos em curso não são afetados (nenhuma FK
     * condicional a `status`).
     */
    async suspendLojista(
      estabelecimentoId: string,
      motivo: string,
      _options?: AsyncCallOptions,
    ): Promise<Estabelecimento> {
      const supabase = resolveClient();

      const { error } = await supabase.rpc('suspender_lojista', {
        p_estabelecimento_id: estabelecimentoId,
        p_motivo: motivo,
      });
      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError('suspender_lojista');
        if (message.includes('NAO_AUTORIZADO')) throw new NaoAutorizadoError('suspender_lojista');
        if (message.includes('MOTIVO_OBRIGATORIO')) throw new MotivoObrigatorioError('suspender_lojista');
        if (message.includes('ESTABELECIMENTO_NAO_ENCONTRADO')) {
          throw new EstabelecimentoNaoEncontradoError('suspender_lojista');
        }
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError('suspender_lojista');
        throw error;
      }

      return fetchEstabelecimentoAposMutacao(supabase, estabelecimentoId);
    },

    /**
     * Story 8.6 (AC4) — [IDS] CREATE, capacidade nova. RPC `reativar_lojista`
     * (`SECURITY DEFINER` + `is_admin()`, guarda `status='suspenso'` —
     * nunca promove `em_analise`/`rejeitado` pulando `aprovar_lojista`).
     */
    async reactivateLojista(estabelecimentoId: string, _options?: AsyncCallOptions): Promise<Estabelecimento> {
      const supabase = resolveClient();

      const { error } = await supabase.rpc('reativar_lojista', { p_estabelecimento_id: estabelecimentoId });
      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError('reativar_lojista');
        if (message.includes('NAO_AUTORIZADO')) throw new NaoAutorizadoError('reativar_lojista');
        if (message.includes('ESTABELECIMENTO_NAO_ENCONTRADO')) {
          throw new EstabelecimentoNaoEncontradoError('reativar_lojista');
        }
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError('reativar_lojista');
        throw error;
      }

      return fetchEstabelecimentoAposMutacao(supabase, estabelecimentoId);
    },

    /**
     * Story 8.8 (AC1, AC2). Leitura de `estabelecimentos_falhas`
     * (tabela NOVA desta Bloco, RLS `admin_gerencia_falhas` — SÓ admin lê,
     * lojista NÃO vê as próprias, por design — ver migration
     * `20260813070005`), ordenada por `criado_em DESC` (espelha
     * `idx_falhas_estab_data`). `detalhes` nullable no banco → `''` honesto
     * (nunca um dado inventado) para caber no contrato `EstabelecimentoFalha.detalhes: string`.
     * Fila vazia até o Bloco 10 popular produtores reais — comportamento
     * esperado, não um bug.
     */
    async lojistaQualityView(
      estabelecimentoId: string,
      _options?: AsyncCallOptions,
    ): Promise<EstabelecimentoFalha[]> {
      const supabase = resolveClient();

      const { data, error } = await supabase
        .from('estabelecimentos_falhas')
        .select('id, estabelecimento_id, pedido_id, tipo, detalhes, criado_em')
        .eq('estabelecimento_id', estabelecimentoId)
        .order('criado_em', { ascending: false });
      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as {
        id: string;
        estabelecimento_id: string;
        pedido_id: string | null;
        tipo: string;
        detalhes: string | null;
        criado_em: string;
      }[];

      return rows.map((row) => ({
        id: row.id,
        estabelecimento_id: row.estabelecimento_id,
        pedido_id: row.pedido_id,
        tipo: row.tipo as EstabelecimentoFalhaTipo,
        detalhes: row.detalhes ?? '',
        criado_em: row.criado_em,
      }));
    },

    /**
     * Story 8.8 (AC1) — contagem de `pedidos` do lojista por balde
     * (entregues/cancelados/no-show), mesma classificação usada pelo mock
     * (ver `admin.mock.ts`). Sem filtro de período — histórico completo (a
     * decisão de "quando suspender" olha o histórico, não uma janela).
     */
    async lojistaOrderCounts(
      estabelecimentoId: string,
      _options?: AsyncCallOptions,
    ): Promise<{ entregues: number; cancelados: number; noShow: number }> {
      const supabase = resolveClient();

      const { data, error } = await supabase
        .from('pedidos')
        .select('status')
        .eq('estabelecimento_id', estabelecimentoId);
      if (error) {
        throw error;
      }

      const statuses = ((data ?? []) as unknown as { status: string }[]).map((r) => r.status as PedidoStatus);
      const cancelados = new Set<PedidoStatus>([
        'cancelado',
        'cancelado_timeout',
        'cancelado_atraso',
        'cancelado_admin',
        'recusado',
        'estornado_chargeback',
      ]);
      const noShow = new Set<PedidoStatus>(['nao_retirado', 'nao_entregue_lojista']);

      return {
        entregues: statuses.filter((s) => s === 'entregue').length,
        cancelados: statuses.filter((s) => cancelados.has(s)).length,
        noShow: statuses.filter((s) => noShow.has(s)).length,
      };
    },

    /**
     * Story 8.7 (AC1, AC3). Queries diretas (sem view materializada — só se
     * performance pedir, fora do escopo desta Story). GMV/receita/ranking
     * derivam de `pedidos WHERE status='entregue' AND entregue_em >=
     * limite` (mandatório, @po); contagens totais/entregues/cancelados/
     * no-show + taxa de sucesso derivam de `pedidos WHERE criado_em >=
     * limite` (SHOULD, @po — "pedidos totais" precisa incluir os que nunca
     * chegaram a `entregue`). Ranking de hubs + gráfico de linha (Recharts)
     * ficam como débito não-bloqueante (decisão de @po, Story 8.7).
     */
    async financialDashboard(periodoDias: number, _options?: AsyncCallOptions): Promise<FinancialDashboardResult> {
      const supabase = resolveClient();
      const limiteIso = new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000).toISOString();

      const { data: entreguesData, error: entreguesError } = await supabase
        .from('pedidos')
        .select('estabelecimento_id, total_pago_reais, subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais, taxa_servico_comprador_reais, entregue_em')
        .eq('status', 'entregue')
        .gte('entregue_em', limiteIso);
      if (entreguesError) {
        throw entreguesError;
      }

      const entreguesRows = (entreguesData ?? []) as unknown as {
        estabelecimento_id: string;
        total_pago_reais: number;
        taxa_keepit_reais: number;
        subtotal_produtos_reais: number;
        taxa_deslocamento_reais: number;
        taxa_servico_comprador_reais: number;
        entregue_em: string | null;
      }[];

      const gmvReais = entreguesRows.reduce((sum, p) => sum + p.total_pago_reais, 0);

      const porLoja = new Map<string, { gmvReais: number; pedidosEntregues: number }>();
      for (const pedido of entreguesRows) {
        const atual = porLoja.get(pedido.estabelecimento_id) ?? { gmvReais: 0, pedidosEntregues: 0 };
        atual.gmvReais += pedido.total_pago_reais;
        atual.pedidosEntregues += 1;
        porLoja.set(pedido.estabelecimento_id, atual);
      }

      let ranking: FinancialRankingEntry[] = [];
      if (porLoja.size > 0) {
        const lojaIds = [...porLoja.keys()];
        const { data: lojasData, error: lojasError } = await supabase
          .from('estabelecimentos')
          .select('id, nome_fantasia')
          .in('id', lojaIds);
        if (lojasError) {
          throw lojasError;
        }
        const nomePorId = new Map(
          ((lojasData ?? []) as unknown as { id: string; nome_fantasia: string }[]).map((l) => [l.id, l.nome_fantasia]),
        );
        ranking = [...porLoja.entries()]
          .map(([estabelecimento_id, agregado]) => ({
            estabelecimento_id,
            nome_fantasia: nomePorId.get(estabelecimento_id) ?? estabelecimento_id,
            gmvReais: agregado.gmvReais,
            pedidosEntregues: agregado.pedidosEntregues,
          }))
          .sort((a, b) => b.gmvReais - a.gmvReais)
          .slice(0, 10);
      }

      const { data: periodoData, error: periodoError } = await supabase
        .from('pedidos')
        .select('status')
        .gte('criado_em', limiteIso);
      if (periodoError) {
        throw periodoError;
      }

      const statusesNoPeriodo = ((periodoData ?? []) as unknown as { status: string }[]).map(
        (r) => r.status as PedidoStatus,
      );
      const cancelados = new Set<PedidoStatus>([
        'cancelado',
        'cancelado_timeout',
        'cancelado_atraso',
        'cancelado_admin',
        'recusado',
        'estornado_chargeback',
      ]);
      const noShow = new Set<PedidoStatus>(['nao_retirado', 'nao_entregue_lojista']);
      const pedidosEntregues = statusesNoPeriodo.filter((s) => s === 'entregue').length;
      const pedidosCancelados = statusesNoPeriodo.filter((s) => cancelados.has(s)).length;
      const pedidosNoShow = statusesNoPeriodo.filter((s) => noShow.has(s)).length;
      const denominadorSucesso = pedidosEntregues + pedidosCancelados + pedidosNoShow;
      const taxaSucessoPercent =
        denominadorSucesso === 0 ? 0 : Math.round((pedidosEntregues / denominadorSucesso) * 1000) / 10;

      // As tabelas são forward-schema desta entrega e ainda não existem no
      // snapshot gerado de Database. O cast fica restrito a estas leituras;
      // linhas continuam mapeadas campo a campo para os tipos de domínio.
      const operational = supabase as unknown as OperationalReadClient;
      const tentativasRows = await fetchAllOperationalRows<{
        id: string; pedido_id: string; operacao_id: string; forma: string; estado: 'reconciliacao';
        asaas_payment_id: string | null; criado_em: string;
      }>((from, to) => operational.from('tentativas_pagamento')
        .select('id, pedido_id, operacao_id, forma, estado, asaas_payment_id, criado_em')
        .eq('estado', 'reconciliacao')
        .order('criado_em', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to));

      const eventColumns = 'evento_externo_id, tipo, cobranca_id, tentativa_id, pedido_id, resultado, erro_codigo, recebido_em';
      let eventosRows: Array<{
        evento_externo_id: string; tipo: string; cobranca_id: string | null;
        tentativa_id: string | null; pedido_id: string | null; resultado: string;
        erro_codigo: string | null; recebido_em: string;
      }> = [];
      for (const tentativaIds of chunks(tentativasRows.map((row) => row.id), 100)) {
        eventosRows.push(...await fetchAllOperationalRows<(typeof eventosRows)[number]>((from, to) =>
          operational.from('eventos_pagamento')
            .select(eventColumns)
            .in('tentativa_id', tentativaIds)
            .order('recebido_em', { ascending: false })
            .order('evento_externo_id', { ascending: true })
            .range(from, to)));
      }
      eventosRows.sort((a, b) => b.recebido_em.localeCompare(a.recebido_em));
      const ultimoEventoPorTentativa = new Map<string, { resultado: string; erro_codigo: string | null }>();
      const ultimoErroPorTentativa = new Map<string, string>();
      for (const event of eventosRows) {
        if (event.tentativa_id && !ultimoEventoPorTentativa.has(event.tentativa_id)) {
          ultimoEventoPorTentativa.set(event.tentativa_id, event);
        }
        if (event.tentativa_id && event.erro_codigo && !ultimoErroPorTentativa.has(event.tentativa_id)) {
          ultimoErroPorTentativa.set(event.tentativa_id, event.erro_codigo);
        }
      }
      // A fila precisa do histórico completo para que um evento posterior sem
      // erro encerre uma divergência anterior da mesma cobrança/tentativa.
      const historicoEventos = await fetchAllOperationalRows<(typeof eventosRows)[number]>((from, to) =>
        operational.from('eventos_pagamento')
          .select(eventColumns)
          .order('recebido_em', { ascending: false })
          .order('evento_externo_id', { ascending: true })
          .range(from, to));
      const divergenciasRows = [
        ...historicoEventos,
        ...eventosRows.filter((event) => event.erro_codigo !== null),
      ]
        .filter((event, index, rows) => rows.findIndex((item) => item.evento_externo_id === event.evento_externo_id) === index)
        .sort((a, b) => b.recebido_em.localeCompare(a.recebido_em));
      const eventosComErro: PaymentEventAdmin[] = divergenciasRows
        .filter((event) => event.erro_codigo !== null)
        .map((event) => ({
          eventoExternoId: event.evento_externo_id,
          tipo: event.tipo,
          cobrancaId: event.cobranca_id,
          tentativaId: event.tentativa_id,
          pedidoId: event.pedido_id,
          resultado: event.resultado,
          erro: event.erro_codigo!,
          recebidoEm: event.recebido_em,
        }));
      const reconciliacoes: PaymentReconciliationAdmin[] = tentativasRows.map((row) => ({
        tentativaId: row.id,
        operacaoId: row.operacao_id,
        pedidoId: row.pedido_id,
        forma: row.forma,
        estado: row.estado,
        asaasPaymentId: row.asaas_payment_id,
        criadoEm: row.criado_em,
        ultimoResultado: ultimoEventoPorTentativa.get(row.id)?.resultado ?? null,
        ultimoErro: ultimoErroPorTentativa.get(row.id) ?? null,
      }));

      const antecipacoesResult = await operational.from('antecipacoes_recebiveis')
        .select('id, antecipacao_externa_id, pedido_id, cobranca_id, estado, valor_centavos, tarifa_centavos, liquido_centavos, data_credito, atualizado_em')
        .order('atualizado_em', { ascending: false });
      if (antecipacoesResult.error) throw antecipacoesResult.error;
      const antecipacoes: ReceivableAnticipationAdmin[] = ((antecipacoesResult.data ?? []) as Array<{
        id: string; antecipacao_externa_id: string; pedido_id: string; cobranca_id: string; estado: string;
        valor_centavos: number; tarifa_centavos: number; liquido_centavos: number;
        data_credito: string | null; atualizado_em: string;
      }>).map((row) => ({
        id: row.id,
        antecipacaoExternaId: row.antecipacao_externa_id,
        pedidoId: row.pedido_id,
        cobrancaId: row.cobranca_id,
        estado: row.estado,
        valorCentavos: row.valor_centavos,
        tarifaCentavos: row.tarifa_centavos,
        liquidoCentavos: row.liquido_centavos,
        dataCredito: row.data_credito,
        atualizadoEm: row.atualizado_em,
      }));

      const ocorrenciasRows = await fetchAllOperationalRows<{
        id: string; pedido_id: string; tipo: PaymentOccurrenceAdmin['tipo']; estado: string;
        referencia_externa: string | null; detalhe: string; criado_em: string;
      }>((from, to) => operational.from('ocorrencias_pagamento')
        .select('id, pedido_id, tipo, estado, referencia_externa, detalhe, criado_em')
        .order('criado_em', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to));

      const decisoes = (await fetchAllOperationalRows<ChargebackDecisionRow>((from, to) =>
        operational.from('decisoes_chargeback')
          .select('id, ocorrencia_id, responsavel_principal, motivo, referencia, principal_informado_centavos, principal_debitado_centavos, taxa_centavos, lancamento_id, criado_em')
          .order('criado_em', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to))).map(mapChargebackDecision);
      const decisaoPorOcorrencia = new Map(decisoes.map((item) => [item.ocorrenciaId, item]));

      const ledgerRows = await fetchAllOperationalRows<LancamentoAdminRow>((from, to) =>
        operational.from('lancamentos_financeiros')
          .select(LANCAMENTO_ADMIN_COLUMNS)
          .order('criado_em', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to));
      const reembolsosPendentes = ledgerRows.filter((row) => row.tipo === 'refund'
        && (row.status === 'pendente' || row.status === 'erro') && row.estado_reserva !== 'liberada');
      const lancamentoPorId = new Map(ledgerRows.map((row) => [row.id, row]));
      const ocorrenciasPagamento: PaymentOccurrenceAdmin[] = ocorrenciasRows.map((row) => {
        const decisao = decisaoPorOcorrencia.get(row.id) ?? null;
        const lancamento = decisao ? lancamentoPorId.get(decisao.lancamentoId) : undefined;
        return {
          id: row.id,
          pedidoId: row.pedido_id,
          tipo: row.tipo,
          estado: row.estado,
          referenciaExterna: row.referencia_externa,
          detalhe: row.detalhe,
          criadoEm: row.criado_em,
          decisao,
          lancamentos: lancamento ? [{
            id: lancamento.id,
            valorCentavos: lancamento.valor_centavos,
            detalhe: lancamento.detalhe,
            criadoEm: lancamento.criado_em,
          }] : [],
        };
      });

      const chavesCorrelacaoEvento = (event: (typeof divergenciasRows)[number]) => {
        const chaves = [
          event.tentativa_id ? `tentativa:${event.tentativa_id}` : null,
          event.cobranca_id ? `cobranca:${event.cobranca_id}` : null,
        ].filter((chave): chave is string => chave !== null);
        if (chaves.length === 0 && event.pedido_id) chaves.push(`pedido:${event.pedido_id}`);
        return chaves;
      };
      const ultimoEventoPorCorrelacao = new Map<string, (typeof divergenciasRows)[number]>();
      for (const event of divergenciasRows) {
        for (const chave of chavesCorrelacaoEvento(event)) {
          if (!ultimoEventoPorCorrelacao.has(chave)) ultimoEventoPorCorrelacao.set(chave, event);
        }
      }
      const tentativasEmReconciliacao = new Set(tentativasRows.map((row) => row.id));
      const divergenciasAbertas = divergenciasRows.filter((event) => {
        const chaves = chavesCorrelacaoEvento(event);
        return event.erro_codigo !== null
          && chaves.length > 0
          && chaves.every((chave) => ultimoEventoPorCorrelacao.get(chave)?.evento_externo_id === event.evento_externo_id)
          && (!event.tentativa_id || !tentativasEmReconciliacao.has(event.tentativa_id));
      });

      const repassesEmAnalise = await fetchAllOperationalRows<{
        id: string; preparado_em: string;
      }>((from, to) => operational.from('repasses')
        .select('id, preparado_em')
        .eq('estado', 'em_analise')
        .order('preparado_em', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to));
      let eventosRepasse: Array<{
        repasse_id: string; operacao_id: string; motivo: string | null;
        referencia: string | null; criado_em: string;
      }> = [];
      for (const repasseIds of chunks(repassesEmAnalise.map((row) => row.id), 100)) {
        eventosRepasse.push(...await fetchAllOperationalRows<(typeof eventosRepasse)[number]>((from, to) =>
          operational.from('repasse_eventos')
            .select('repasse_id, operacao_id, motivo, referencia, criado_em')
            .in('repasse_id', repasseIds)
            .eq('tipo', 'analise')
            .order('criado_em', { ascending: false })
            .order('operacao_id', { ascending: true })
            .range(from, to)));
      }
      eventosRepasse.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
      const ultimoEventoPorRepasse = new Map<string, (typeof eventosRepasse)[number]>();
      const primeiroEventoPorRepasse = new Map<string, (typeof eventosRepasse)[number]>();
      for (const event of eventosRepasse) {
        if (!ultimoEventoPorRepasse.has(event.repasse_id)) ultimoEventoPorRepasse.set(event.repasse_id, event);
        primeiroEventoPorRepasse.set(event.repasse_id, event);
      }

      const pendenciasFinanceiras: FinancialPendingAdmin[] = [
        ...reconciliacoes.map((item) => ({
          id: `tentativa:${item.tentativaId}`,
          tipo: 'reconciliacao_pagamento' as const,
          pedidoId: item.pedidoId,
          operacaoId: item.operacaoId,
          abertoEm: item.criadoEm,
          ultimoResultado: item.ultimoResultado,
          ultimoErro: item.ultimoErro,
          referenciaExterna: item.asaasPaymentId,
          acaoPermitida: 'reconciliar_pagamento' as const,
        })),
        ...((await supabase.rpc('listar_pendencias_validacao_cartao_admin')).data ?? []).map((item) => ({
          id: `validacao:${item.operacao_id}`,
          tipo: 'validacao_cartao' as const,
          pedidoId: null,
          operacaoId: item.operacao_id,
          abertoEm: item.aberto_em,
          ultimoResultado: item.estado,
          ultimoErro: item.erro_seguro,
          referenciaExterna: item.referencia_externa,
          acaoPermitida: 'reconciliar_validacao_cartao' as const,
        })),
        ...divergenciasAbertas.map((item) => ({
          id: `evento:${item.evento_externo_id}`,
          tipo: 'evento_divergente' as const,
          pedidoId: item.pedido_id,
          operacaoId: item.evento_externo_id,
          abertoEm: item.recebido_em,
          ultimoResultado: item.resultado,
          ultimoErro: item.erro_codigo,
          referenciaExterna: item.cobranca_id,
          acaoPermitida: 'consultar_divergencia' as const,
        })),
        ...reembolsosPendentes.map((item) => ({
          id: `reembolso:${item.id}`,
          tipo: 'reembolso' as const,
          pedidoId: item.pedido_id,
          operacaoId: item.id,
          abertoEm: item.criado_em,
          ultimoResultado: item.status,
          ultimoErro: item.status === 'erro' ? item.detalhe : null,
          referenciaExterna: item.asaas_id_externo ?? null,
          acaoPermitida: 'tratar_reembolso' as const,
        })),
        ...repassesEmAnalise.map((item) => {
          const ultimoEvento = ultimoEventoPorRepasse.get(item.id);
          const primeiroEvento = primeiroEventoPorRepasse.get(item.id);
          return {
            id: `repasse:${item.id}`,
            tipo: 'repasse_em_analise' as const,
            pedidoId: null,
            operacaoId: ultimoEvento?.operacao_id ?? item.id,
            abertoEm: primeiroEvento?.criado_em ?? item.preparado_em,
            ultimoResultado: ultimoEvento?.motivo ?? 'em_analise',
            ultimoErro: ultimoEvento?.motivo ?? null,
            referenciaExterna: ultimoEvento?.referencia ?? null,
            acaoPermitida: 'revisar_repasse' as const,
          };
        }),
      ].sort((a, b) => a.abertoEm.localeCompare(b.abertoEm));

      const receivedResult = await supabase.from('pedidos')
        .select('total_pago_reais').not('pago_em', 'is', null).gte('pago_em', limiteIso);
      if (receivedResult.error) throw receivedResult.error;
      const overview = calculateFinancialOverview({
        receipts: ((receivedResult.data ?? []) as unknown as Array<{ total_pago_reais: number }>),
        delivered: entreguesRows,
        ledger: ledgerRows.filter((row) => row.tipo !== 'refund' || (row.concluido_em != null && row.concluido_em >= limiteIso)),
        gatewayFees: antecipacoes.filter((row) => row.dataCredito && row.dataCredito >= limiteIso)
          .map((row) => ({ tarifa_centavos: row.tarifaCentavos, estado: row.estado })),
      });
      const repassesPagosReais = ledgerRows.filter((row) => row.tipo === 'payout' &&
        row.status === 'concluido' && row.concluido_em && row.concluido_em >= limiteIso)
        .reduce((sum, row) => sum + Math.abs(row.valor_centavos), 0) / 100;

      return {
        periodoDias,
        gmvReais,
        ...overview,
        repassesPagosReais,
        ranking,
        pedidosTotais: statusesNoPeriodo.length,
        pedidosEntregues,
        pedidosCancelados,
        pedidosNoShow,
        taxaSucessoPercent,
        reconciliacoes,
        antecipacoes,
        eventosComErro,
        ocorrenciasPagamento,
        pendenciasFinanceiras,
      };
    },

    async decideChargeback(input) {
      const { data, error } = await resolveClient().rpc('resolver_chargeback_admin', {
        p_ocorrencia_id: input.ocorrenciaId,
        p_responsavel_principal: input.responsavelPrincipal,
        p_motivo: input.motivo,
        p_referencia: input.referencia,
        p_principal_centavos: input.principalCentavos,
        p_operacao_id: input.operacaoId,
      });
      if (error) throw error;
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('[core-data] resolver_chargeback_admin — resposta inválida.');
      }
      return data as unknown as ChargebackDecisionAdmin;
    },

    async inspectPayment(pedidoId: string, _options?: AsyncCallOptions): Promise<AdminPaymentInspection | null> {
      const { data, error } = await resolveClient().rpc('inspecionar_pagamento_admin', {
        p_pedido_id: pedidoId,
      });
      if (error) throw error;
      if (data === null) return null;
      const inspection = data as unknown as Omit<AdminPaymentInspection, 'pendencia'> & {
        pendencia?: AdminPaymentInspection['pendencia'];
      };
      return { ...inspection, pendencia: inspection.pendencia ?? null };
    },

    async reconcilePayment(tentativaId: string, _options?: AsyncCallOptions) {
      const supabase = resolveClient();
      const { data, error } = await supabase.functions.invoke('reconcile-payment', {
        body: { tentativaId },
      });
      if (error) throw error;
      const body = data as { ok?: unknown; resultado?: unknown; pedido_id?: unknown } | null;
      if (!body || body.ok !== true || typeof body.resultado !== 'string'
        || (body.pedido_id !== null && typeof body.pedido_id !== 'string')) {
        throw new Error('[core-data] reconcile-payment — resposta inválida.');
      }
      return { resultado: body.resultado, pedidoId: body.pedido_id };
    },
    async reconciliarValidacaoCartao(operacaoId: string, _options?: AsyncCallOptions) {
      const supabase = resolveClient();
      const { data, error } = await supabase.functions.invoke('reconcile-card-validation', { body: { operacaoId } });
      if (error || !data || typeof data !== 'object' || typeof (data as { id?: unknown }).id !== 'string'
        || typeof (data as { estado?: unknown }).estado !== 'string' || typeof (data as { valorCentavos?: unknown }).valorCentavos !== 'number') {
        throw error ?? new Error('[core-data] reconcile-card-validation — resposta inválida.');
      }
      const value = data as { id: string; estado: string; valorCentavos: number };
      return { id: value.id, estado: value.estado, valorCentavos: value.valorCentavos };
    },

    /**
     * Story 8.3 (AC1, AC2, AC3). [IDS] REUSE de `PEDIDO_COLUMNS`/
     * `mapRowToPedido`/`fetchItensPorPedidoIds` (`order.supabase.ts`) — RLS
     * `pode_ver_pedido` (`is_admin() OR ...`) já cobre leitura irrestrita de
     * admin, nenhuma policy nova. Ordenado por `criado_em DESC`. Filtros
     * adicionais (hub/estabelecimento/cliente/datas) e paginação real ficam
     * como débito não-bloqueante (decisão de @po, Story 8.3).
     */
    async listAllOrders(
      filtros?: { status?: PedidoStatus },
      _options?: AsyncCallOptions,
    ): Promise<Pedido[]> {
      const supabase = resolveClient();

      let query = supabase.from('pedidos').select(PEDIDO_COLUMNS).order('criado_em', { ascending: false });
      if (filtros?.status) {
        query = query.eq('status', filtros.status);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as unknown as PedidoRow[];
      if (rows.length === 0) {
        return [];
      }

      const itensPorPedido = await fetchItensPorPedidoIds(supabase, rows.map((r) => r.id));
      return rows.map((row) => mapRowToPedido(row, itensPorPedido[row.id] ?? []));
    },

    /**
     * Story 8.4 (AC1-AC4). RPC atômica `forcar_cancelamento_pedido`
     * (transição `cancelado_admin` + `refund` 100% na MESMA transação —
     * nunca um pedido cancelado sem reembolso correspondente, nem vice-versa).
     * `_motivo` já é validado client-side (textarea obrigatória) E
     * server-side (`MOTIVO_OBRIGATORIO`, defesa contra bypass). Releitura
     * real do pedido após o sucesso — `fetchPedidoPorId` (REUSE de
     * `order.supabase.ts`), nunca ecoa o input.
     */
    async forceCancelOrder(pedidoId: string, motivo: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const { error } = await supabase.rpc('forcar_cancelamento_pedido', {
        p_pedido_id: pedidoId,
        p_motivo: motivo,
      });
      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError('forcar_cancelamento_pedido');
        if (message.includes('NAO_AUTORIZADO')) throw new NaoAutorizadoError('forcar_cancelamento_pedido');
        if (message.includes('MOTIVO_OBRIGATORIO')) throw new MotivoObrigatorioError('forcar_cancelamento_pedido');
        if (message.includes('PEDIDO_NAO_ENCONTRADO')) throw new PedidoNaoEncontradoError();
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError('forcar_cancelamento_pedido');
        throw error;
      }

      const pedido = await fetchPedidoPorId(supabase, pedidoId);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] forcar_cancelamento_pedido — RPC concluiu com sucesso mas a releitura não encontrou o pedido (inesperado).',
        );
      }
      return pedido;
    },
  };
}
