import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  AdvanceableStatus,
  CreatePedidoInput,
  FormaPagamento,
  OrderPort,
  Pedido,
  PedidoItem,
  PedidoStatus,
} from '../ports/order.port';
import type { AsyncCallOptions } from '../types';
import {
  AcessoNegadoError,
  AutenticacaoNecessariaError,
  ClienteNaoEncontradoError,
  EstadoInvalidoError,
  HubIndisponivelError,
  HubNaoAtendidoError,
  ItensInvalidosError,
  LojaIndisponivelError,
  PedidoNaoEncontradoError,
  TempoEstimadoInvalidoError,
} from './order-errors';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'order';
const EPIC = 'Épico 6';

/**
 * Story 6.6/6.7 — SEM `pin_hash` (nunca selecionado, nunca exposto pela
 * `OrderPort` — `Pedido.pin_hash` não existe no tipo de domínio, ver
 * `ports/order.port.ts`). SEM as 3 colunas de rastreio pós-aceite
 * (`saiu_hub_em`/`cliente_chegou_em`/`lojista_chegou_em`) — não existem no
 * schema do piloto (ver `20260813004932_criar_pedidos.sql`, "FICA FORA").
 */
const PEDIDO_COLUMNS =
  'id, numero, cliente_id, estabelecimento_id, hub_id, status, pin_texto, tentativas_pin, pin_bloqueado_ate, tempo_estimado_min, criado_em, aceito_em, entregue_em, cancelado_em, subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais, total_pago_reais, motivo_recusa, motivo_cancelamento, motivo_nao_retirado, forma_pagamento';

const PEDIDO_ITEM_COLUMNS = 'id, pedido_id, produto_id, nome_snapshot, preco_unitario_reais, quantidade, subtotal_reais';

type PedidoRow = {
  id: string;
  numero: number;
  cliente_id: string;
  estabelecimento_id: string;
  hub_id: string;
  status: string;
  pin_texto: string;
  tentativas_pin: number;
  pin_bloqueado_ate: string | null;
  tempo_estimado_min: number | null;
  criado_em: string;
  aceito_em: string | null;
  entregue_em: string | null;
  cancelado_em: string | null;
  subtotal_produtos_reais: number;
  taxa_deslocamento_reais: number;
  taxa_keepit_reais: number;
  total_pago_reais: number;
  motivo_recusa: string | null;
  motivo_cancelamento: string | null;
  motivo_nao_retirado: string | null;
  forma_pagamento: string;
};

type PedidoItemRow = {
  id: string;
  pedido_id: string;
  produto_id: string | null;
  nome_snapshot: string;
  preco_unitario_reais: number;
  quantidade: number;
  subtotal_reais: number;
};

function mapRowToPedidoItem(row: PedidoItemRow): PedidoItem {
  return {
    id: row.id,
    pedido_id: row.pedido_id,
    produto_id: row.produto_id,
    nome_snapshot: row.nome_snapshot,
    preco_unitario_reais: row.preco_unitario_reais,
    quantidade: row.quantidade,
    subtotal_reais: row.subtotal_reais,
  };
}

/**
 * Story 6.6/6.7 — `saiu_hub_em`/`cliente_chegou_em`/`lojista_chegou_em`
 * sempre `null`: colunas que a `Pedido` (contrato de domínio) exige mas o
 * schema do piloto NÃO cria ainda (rastreio pós-aceite, "FICA FORA" na
 * migration `20260813004932`) — honesto sobre o que o piloto rastreia hoje,
 * em vez de inventar um valor. Reavaliar quando essas colunas forem
 * migradas.
 */
function mapRowToPedido(row: PedidoRow, itens: PedidoItem[]): Pedido {
  return {
    id: row.id,
    numero: row.numero,
    cliente_id: row.cliente_id,
    estabelecimento_id: row.estabelecimento_id,
    hub_id: row.hub_id,
    status: row.status as PedidoStatus,
    pin_texto: row.pin_texto,
    tentativas_pin: row.tentativas_pin,
    pin_bloqueado_ate: row.pin_bloqueado_ate,
    tempo_estimado_min: row.tempo_estimado_min,
    criado_em: row.criado_em,
    aceito_em: row.aceito_em,
    saiu_hub_em: null,
    cliente_chegou_em: null,
    lojista_chegou_em: null,
    entregue_em: row.entregue_em,
    cancelado_em: row.cancelado_em,
    subtotal_produtos_reais: row.subtotal_produtos_reais,
    taxa_deslocamento_reais: row.taxa_deslocamento_reais,
    taxa_keepit_reais: row.taxa_keepit_reais,
    total_pago_reais: row.total_pago_reais,
    motivo_recusa: row.motivo_recusa,
    motivo_cancelamento: row.motivo_cancelamento,
    motivo_nao_retirado: row.motivo_nao_retirado,
    forma_pagamento: row.forma_pagamento as FormaPagamento,
    itens,
  };
}

/**
 * Story 6.6/6.7 — busca em lote os itens de vários pedidos numa única
 * query (`in('pedido_id', ...)`), sob a RLS `ve_itens_relacionados`
 * (visibilidade DERIVADA do pedido pai via `pode_ver_pedido`). `[]` de
 * entrada resolve `{}` sem tocar a rede (mesmo padrão de
 * `fetchEstabelecimentosPorIds`, `store.supabase.ts`).
 */
async function fetchItensPorPedidoIds(
  supabase: SupabaseClient<Database>,
  pedidoIds: string[],
): Promise<Record<string, PedidoItem[]>> {
  if (pedidoIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase.from('pedidos_itens').select(PEDIDO_ITEM_COLUMNS).in('pedido_id', pedidoIds);
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as PedidoItemRow[];
  const map: Record<string, PedidoItem[]> = {};
  for (const row of rows) {
    const item = mapRowToPedidoItem(row);
    const bucket = map[row.pedido_id] ?? [];
    bucket.push(item);
    map[row.pedido_id] = bucket;
  }
  return map;
}

/**
 * Story 6.6 (AC4) — releitura REAL pós-`criar_pedido` (a RPC devolve só
 * `pedido_id`/`numero`/`pin_texto`, ver AC1) e Story 6.7 (AC1) — leitura de
 * um pedido específico para `listMine`. Sob a RLS `ve_pedidos_relacionados`
 * (cliente-dono, lojista-dono ou admin) — `null` honesto se a linha não
 * existir ou a RLS bloquear (nunca simula um pedido).
 */
async function fetchPedidoPorId(supabase: SupabaseClient<Database>, pedidoId: string): Promise<Pedido | null> {
  const { data, error } = await supabase.from('pedidos').select(PEDIDO_COLUMNS).eq('id', pedidoId).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const row = data as unknown as PedidoRow;
  const itensPorPedido = await fetchItensPorPedidoIds(supabase, [pedidoId]);
  return mapRowToPedido(row, itensPorPedido[pedidoId] ?? []);
}

/**
 * Esqueleto Supabase de `OrderPort` (Story 1.9). Pedido & PIN — fluxo
 * completo (Cliente + Lojista) — é o Épico 6. `create` (Story 6.6) e
 * `listMine` (Story 6.7) são implementações reais; os demais métodos
 * permanecem `NotImplementedError` até as Stories que os cobrem
 * (aceite/recusa/PIN/cancelamento/lado lojista — Stories 6.8+).
 */
export function createOrderSupabase(client?: SupabaseClient<Database>): OrderPort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    /**
     * Story 6.6 (AC1, AC3, AC4). Chama a RPC `SECURITY DEFINER`
     * `criar_pedido` — `cliente_id` NÃO é parâmetro (a RPC usa sempre
     * `auth.uid()`) e `forma_pagamento` NÃO é parâmetro (a RPC fixa
     * `'pix'`, cartão é LATER); `input.cliente_id`/`input.forma_pagamento`
     * existem no contrato da port por paridade com o mock, mas não são
     * enviados à RPC. Cada item de `p_itens` carrega o snapshot já
     * congelado por quem chama (`nome_snapshot`/`preco_unitario_reais`,
     * Story 6.1 `CartItem.precoSnapshotReais`) — a RPC NÃO relê `produtos`.
     * Os 5 totais de cabeçalho são enviados como PARÂMETROS e persistidos
     * como snapshot pela RPC (ela não os recalcula — "LIMITAÇÃO DE
     * PILOTO", AC1).
     *
     * Mapeia os 6 erros NOMEADOS (`RAISE EXCEPTION`) da RPC para classes
     * dedicadas (`order-errors.ts`) — nunca engole o erro, nunca simula
     * sucesso. Como a RPC devolve só `(pedido_id, numero, pin_texto)`
     * (AC1), o `Pedido` completo vem de uma RELEITURA real
     * (`fetchPedidoPorId`) — nunca ecoa/inventa os demais campos a partir
     * do input.
     */
    async create(input: CreatePedidoInput, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('criar_pedido', {
        p_estabelecimento_id: input.estabelecimento_id,
        p_hub_id: input.hub_id,
        p_itens: input.itens.map((item) => ({
          produto_id: item.produto_id,
          nome_snapshot: item.nome_snapshot,
          preco_unitario: item.preco_unitario_reais,
          quantidade: item.quantidade,
        })) as unknown as Json,
        p_subtotal_produtos_reais: input.subtotal_produtos_reais,
        p_taxa_deslocamento_reais: input.taxa_deslocamento_reais,
        p_taxa_keepit_reais: input.taxa_keepit_reais,
        p_taxa_servico_comprador_reais: input.taxa_servico_comprador_reais,
        p_total_pago_reais: input.total_pago_reais,
        p_nf_solicitada: input.nf_solicitada,
      });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('CLIENTE_NAO_ENCONTRADO')) throw new ClienteNaoEncontradoError();
        if (message.includes('ITENS_INVALIDOS')) throw new ItensInvalidosError();
        if (message.includes('LOJA_INDISPONIVEL')) throw new LojaIndisponivelError();
        if (message.includes('HUB_NAO_ATENDIDO')) throw new HubNaoAtendidoError();
        if (message.includes('HUB_INDISPONIVEL')) throw new HubIndisponivelError();
        throw error;
      }

      const row = data?.[0];
      if (!row) {
        throw new Error('[core-data/supabase] criar_pedido — RPC retornou vazio sem erro.');
      }

      const pedido = await fetchPedidoPorId(supabase, row.pedido_id);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] criar_pedido — pedido criado mas a releitura não encontrou a linha (RLS bloqueando ou id inesperado).',
        );
      }
      return pedido;
    },

    /**
     * Story 6.7 (AC1, AC4, AC5). Autorização SEMPRE pela SESSÃO
     * (`auth.uid()`), NUNCA pelo `clienteId` recebido como parâmetro (AC5 —
     * "não aceita clienteId de outro usuário como fonte de autorização"),
     * mesmo padrão já usado por `auth.supabase.ts#updateProfile`/
     * `estabelecimento-cadastro.supabase.ts#atualizarMeuPerfil`. RLS
     * `ve_pedidos_relacionados` é a SEGUNDA barreira, não a única. Sem
     * sessão, resolve `[]` honesto (nunca lança) — mesmo contrato do mock.
     * Ordenado por `criado_em DESC` (mesmo índice `idx_pedidos_cliente`).
     */
    async listMine(_clienteId: string, _options?: AsyncCallOptions): Promise<Pedido[]> {
      const supabase = resolveClient();

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      const user = userData.user;
      if (!user) {
        return [];
      }

      const { data, error } = await supabase
        .from('pedidos')
        .select(PEDIDO_COLUMNS)
        .eq('cliente_id', user.id)
        .order('criado_em', { ascending: false });
      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as PedidoRow[];
      const itensPorPedido = await fetchItensPorPedidoIds(
        supabase,
        rows.map((row) => row.id),
      );
      return rows.map((row) => mapRowToPedido(row, itensPorPedido[row.id] ?? []));
    },

    async getById(_pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido | null> {
      throw new NotImplementedError(PORT, 'getById', EPIC);
    },

    /**
     * Story 6.9 (AC2, AC3). Chama a RPC `SECURITY DEFINER` `aceitar_pedido`
     * — autoriza por ownership (`estabelecimentos.dono_user_id = auth.uid()`)
     * OU `is_admin()`, DENTRO da função (não confia em nenhum id cru vindo
     * do client); só transiciona a partir de `aguardando_aceite`
     * (dupla-aceitação vira `ESTADO_INVALIDO`, não sucesso silencioso). A
     * RPC retorna SÓ o `uuid` do pedido (`RETURNS uuid`, não a linha
     * completa) — o `Pedido` final vem de uma RELEITURA real
     * (`fetchPedidoPorId`), mesmo padrão de `create` (Story 6.6).
     *
     * Mapeia os 5 erros NOMEADOS (`RAISE EXCEPTION`) para classes dedicadas
     * (`order-errors.ts`) — nunca engole o erro, nunca simula sucesso.
     */
    async accept(pedidoId: string, tempoEstimadoMin: number, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('aceitar_pedido', {
        p_pedido_id: pedidoId,
        p_tempo_estimado_min: tempoEstimadoMin,
      });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('TEMPO_ESTIMADO_INVALIDO')) throw new TempoEstimadoInvalidoError();
        if (message.includes('PEDIDO_NAO_ENCONTRADO')) throw new PedidoNaoEncontradoError();
        if (message.includes('ACESSO_NEGADO')) throw new AcessoNegadoError();
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError();
        throw error;
      }

      if (!data) {
        throw new Error('[core-data/supabase] aceitar_pedido — RPC retornou vazio sem erro.');
      }

      const pedido = await fetchPedidoPorId(supabase, data);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] aceitar_pedido — pedido aceito mas a releitura não encontrou a linha (RLS bloqueando ou id inesperado).',
        );
      }
      return pedido;
    },

    async refuse(_pedidoId: string, _motivo: string, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'refuse', EPIC);
    },

    async confirmPin(_pedidoId: string, _pin: string, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'confirmPin', EPIC);
    },

    async cancel(_pedidoId: string, _motivo: string, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'cancel', EPIC);
    },

    /**
     * Story 6.8 (AC1, AC5). Autorização SEMPRE pela SESSÃO — nunca pelo
     * `estabelecimentoId` recebido como parâmetro (mesmo padrão de
     * `listMine`, Story 6.7 AC5): resolve o estabelecimento do lojista
     * chamando a RPC `meu_estabelecimento_id()` (deriva de `auth.uid()`,
     * `20260813004932_criar_pedidos.sql`), não o `estabelecimentoId` cru.
     * RLS `ve_pedidos_relacionados` é a SEGUNDA barreira, não a única. Sem
     * sessão/sem estabelecimento próprio, resolve `[]` honesto (nunca
     * lança) — mesmo contrato do mock. Ordenado por `criado_em DESC`.
     */
    async listByEstabelecimento(_estabelecimentoId: string, _options?: AsyncCallOptions): Promise<Pedido[]> {
      const supabase = resolveClient();

      const { data: meuEstabelecimentoId, error: estabError } = await supabase.rpc('meu_estabelecimento_id');
      if (estabError) {
        throw estabError;
      }
      if (!meuEstabelecimentoId) {
        return [];
      }

      const { data, error } = await supabase
        .from('pedidos')
        .select(PEDIDO_COLUMNS)
        .eq('estabelecimento_id', meuEstabelecimentoId)
        .order('criado_em', { ascending: false });
      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as PedidoRow[];
      const itensPorPedido = await fetchItensPorPedidoIds(
        supabase,
        rows.map((row) => row.id),
      );
      return rows.map((row) => mapRowToPedido(row, itensPorPedido[row.id] ?? []));
    },

    async markReadyForHub(_pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'markReadyForHub', EPIC);
    },

    async markArrivedAtHub(_pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'markArrivedAtHub', EPIC);
    },

    async markCustomerNoShow(_pedidoId: string, _motivo: string, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'markCustomerNoShow', EPIC);
    },

    async advanceStatus(
      _pedidoId: string,
      _nextStatus: AdvanceableStatus,
      _options?: AsyncCallOptions,
    ): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'advanceStatus', EPIC);
    },

    async markClienteChegou(_pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'markClienteChegou', EPIC);
    },
  };
}
