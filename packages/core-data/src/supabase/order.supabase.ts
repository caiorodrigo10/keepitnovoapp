import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createSupportOperationId } from '../support-operation-id';
import { createSupportSupabase } from './support.supabase';
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
import { PinBloqueadoError, PinIncorretoError } from '../ports/order.port';
import type { AsyncCallOptions } from '../types';
import {
  AcessoNegadoError,
  AtrasoNaoConfirmadoError,
  AutenticacaoNecessariaError,
  EstadoInvalidoError,
  MotivoObrigatorioError,
  PedidoNaoEncontradoError,
  TempoEstimadoInvalidoError,
  TempoMinimoNaoAtingidoError,
  TransicaoInvalidaError,
} from './order-errors';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'order';
const EPIC = 'Épico 6';

/**
 * Story 6.6/6.7 — SEM `pin_hash` (nunca selecionado, nunca exposto pela
 * `OrderPort` — `Pedido.pin_hash` não existe no tipo de domínio, ver
 * `ports/order.port.ts`). SEM `cliente_chegou_em`/`lojista_chegou_em` — não
 * existem no schema do piloto (ver `20260813004932_criar_pedidos.sql`,
 * "FICA FORA"; confirmado LATER também pela Story 6.12, Dependencies).
 * Story 6.12 (AC2, AC4) — ADAPT: `saiu_hub_em` ENTROU na seleção (coluna
 * aplicada por `20260813022930_pedidos_add_saiu_hub_em.sql` e gravada pela
 * RPC `avancar_estado_pedido`) — antes desta Story, sempre `null` hard-coded
 * (ver `mapRowToPedido` abaixo).
 * Story 6.16 (AC1, AC3) — ADAPT: `taxa_servico_comprador_reais` ENTROU na
 * seleção — a coluna já existia (`20260813004932_criar_pedidos.sql`) e já
 * era gravada por `criar_pedido` (Story 6.6), mas nunca tinha sido lida de
 * volta pelo read model (gap real, ver `Pedido.taxa_servico_comprador_reais`
 * em `ports/order.port.ts`).
 *
 * [IDS] REUSE (Bloco 09, Stories 8.3/8.4) — `PEDIDO_COLUMNS`/`mapRowToPedido`/
 * `fetchItensPorPedidoIds`/`fetchPedidoPorId` exportados para
 * `admin.supabase.ts#listAllOrders`/`forceCancelOrder` reaproveitarem a MESMA
 * leitura/mapeamento de `pedidos` (nenhuma leitura administrativa de pedido
 * deveria divergir do mapeamento canônico já usado pelo Cliente/Lojista).
 */
export const PEDIDO_COLUMNS =
  'id, numero, cliente_id, estabelecimento_id, hub_id, status, cliente_nome:pedido_cliente_nome, tentativas_pin, pin_bloqueado_ate, tempo_estimado_min, criado_em, aceito_em, saiu_hub_em, cliente_chegou_em, entregue_em, cancelado_em, subtotal_produtos_reais, taxa_deslocamento_reais, taxa_keepit_reais, taxa_servico_comprador_reais, total_pago_reais, motivo_recusa, motivo_cancelamento, motivo_nao_retirado, forma_pagamento';

const PEDIDO_ITEM_COLUMNS = 'id, pedido_id, produto_id, nome_snapshot, preco_unitario_reais, quantidade, subtotal_reais';

export type PedidoRow = {
  id: string;
  numero: number;
  cliente_id: string;
  estabelecimento_id: string;
  hub_id: string;
  status: string;
  cliente_nome?: string;
  tentativas_pin: number;
  pin_bloqueado_ate: string | null;
  tempo_estimado_min: number | null;
  criado_em: string;
  aceito_em: string | null;
  saiu_hub_em: string | null;
  cliente_chegou_em: string | null;
  entregue_em: string | null;
  cancelado_em: string | null;
  subtotal_produtos_reais: number;
  taxa_deslocamento_reais: number;
  taxa_keepit_reais: number;
  taxa_servico_comprador_reais: number;
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
 * Story 6.6/6.7 — `lojista_chegou_em` sempre `null`: coluna que a `Pedido`
 * (contrato de domínio) exige mas o schema do piloto NÃO cria (rastreio de
 * chegada do LOJISTA ao hub, "FICA FORA" na migration `20260813004932`,
 * decisão deliberada reforçada em `20260813022930` — `status='no_hub'` é
 * atingido por um único check-in operacional do lojista via
 * `avancar_estado_pedido`, sem coluna de timestamp dedicada) — honesto sobre
 * o que o piloto rastreia hoje, em vez de inventar um valor.
 * Story 6.12 (AC2, AC4) — ADAPT: `saiu_hub_em` passou a vir da RELEITURA
 * real (`row.saiu_hub_em`), não mais hard-coded `null` — a coluna existe e é
 * gravada pela RPC `avancar_estado_pedido`.
 * Story 6.20 (pré-requisito, ver `20260814000001_pedidos_add_cliente_chegou_em.sql`)
 * — ADAPT: `cliente_chegou_em` passou a vir da RELEITURA real
 * (`row.cliente_chegou_em`), não mais hard-coded `null` — a coluna foi
 * adicionada nesta mesma Story e é gravada pela RPC `marcar_cliente_chegou`.
 */
export function mapRowToPedido(row: PedidoRow, itens: PedidoItem[]): Pedido {
  return {
    id: row.id,
    numero: row.numero,
    cliente_id: row.cliente_id,
    estabelecimento_id: row.estabelecimento_id,
    hub_id: row.hub_id,
    status: row.status as PedidoStatus,
    cliente_nome: row.cliente_nome,
    tentativas_pin: row.tentativas_pin,
    pin_bloqueado_ate: row.pin_bloqueado_ate,
    tempo_estimado_min: row.tempo_estimado_min,
    criado_em: row.criado_em,
    aceito_em: row.aceito_em,
    saiu_hub_em: row.saiu_hub_em,
    cliente_chegou_em: row.cliente_chegou_em,
    lojista_chegou_em: null,
    entregue_em: row.entregue_em,
    cancelado_em: row.cancelado_em,
    subtotal_produtos_reais: row.subtotal_produtos_reais,
    taxa_deslocamento_reais: row.taxa_deslocamento_reais,
    taxa_keepit_reais: row.taxa_keepit_reais,
    taxa_servico_comprador_reais: row.taxa_servico_comprador_reais,
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
export async function fetchItensPorPedidoIds(
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
 * `pedido_id`/`numero`, ver AC1) e Story 6.7 (AC1) — leitura de
 * um pedido específico para `listMine`. Sob a RLS `ve_pedidos_relacionados`
 * (cliente-dono, lojista-dono ou admin) — `null` honesto se a linha não
 * existir ou a RLS bloquear (nunca simula um pedido).
 */
export async function fetchPedidoPorId(supabase: SupabaseClient<Database>, pedidoId: string): Promise<Pedido | null> {
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

/** Ciclo de vida do pedido sob RLS; criação financeira pertence a CheckoutPort. */
export function createOrderSupabase(client?: SupabaseClient<Database>): OrderPort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    /** Criação com valores do aplicativo foi substituída por CheckoutPort.criar. */
    async create(_input: CreatePedidoInput, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new Error('CHECKOUT_COTACAO_OBRIGATORIA: use checkout.criar com uma cotação do servidor.');
    },

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

    async getById(pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido | null> {
      return fetchPedidoPorId(resolveClient(), pedidoId);
    },

    async obterPinCliente(pedidoId: string): Promise<string> {
      const { data, error } = await resolveClient().rpc('obter_pin_cliente', { p_pedido_id: pedidoId });
      if (error) {
        if (error.message?.includes('ACESSO_NEGADO')) throw new AcessoNegadoError();
        throw error;
      }
      if (typeof data !== 'string' || !/^\d{4}$/.test(data)) throw new Error('PIN_INDISPONIVEL');
      return data;
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

    /**
     * Story 6.11 (AC2, AC3). Chama a RPC `SECURITY DEFINER` `recusar_pedido` —
     * autoriza por ownership (`estabelecimentos.dono_user_id = auth.uid()`) OU
     * `is_admin()`, DENTRO da função (mesmo padrão de `accept`); só transiciona
     * a partir de `aguardando_aceite` (recusa fora dessa janela vira
     * `ESTADO_INVALIDO`, não sucesso silencioso). Na mesma transação da RPC, um
     * refund 100% pendente é inserido no ledger — este adapter não precisa
     * (nem pode) inserir nada além de chamar a RPC. A RPC retorna SÓ o `uuid`
     * do pedido (`RETURNS uuid`, não a linha completa) — o `Pedido` final vem
     * de uma RELEITURA real (`fetchPedidoPorId`), mesmo padrão de
     * `create`/`accept`.
     *
     * Mapeia os 5 erros NOMEADOS (`RAISE EXCEPTION`) para classes dedicadas
     * (`order-errors.ts`) — nunca engole o erro, nunca simula sucesso.
     */
    async refuse(pedidoId: string, motivo: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('recusar_pedido', {
        p_pedido_id: pedidoId,
        p_motivo: motivo,
      });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('MOTIVO_OBRIGATORIO')) throw new MotivoObrigatorioError();
        if (message.includes('PEDIDO_NAO_ENCONTRADO')) throw new PedidoNaoEncontradoError();
        if (message.includes('ACESSO_NEGADO')) throw new AcessoNegadoError();
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError();
        throw error;
      }

      if (!data) {
        throw new Error('[core-data/supabase] recusar_pedido — RPC retornou vazio sem erro.');
      }

      const pedido = await fetchPedidoPorId(supabase, data);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] recusar_pedido — pedido recusado mas a releitura não encontrou a linha (RLS bloqueando ou id inesperado).',
        );
      }
      return pedido;
    },

    /**
     * Story 6.15 (AC2, AC3, AC4, AC6). Chama a RPC `SECURITY DEFINER`
     * `confirmar_pin_pedido` — compara o PIN via `crypt()` inteiramente no
     * servidor (nunca em texto puro do lado do client) e exige `status =
     * 'no_hub'`. Os 4 erros ESTRUTURAIS (`RAISE EXCEPTION`, avaliados ANTES
     * de qualquer mutação) mapeiam para classes dedicadas, igual ao padrão
     * de `accept`. Os 3 DESFECHOS do PIN (`entregue`/`pin_incorreto`/
     * `pin_bloqueado`) vêm como LINHA DE RESULTADO (`RETURNS TABLE`), NÃO
     * como exceção — a RPC nunca faz `RAISE` depois do `UPDATE` que
     * incrementa `tentativas_pin`, para não fazer `ROLLBACK` do próprio
     * contador do lockout (ver header da migration
     * `20260813022932_rpc_confirmar_pin_pedido.sql`). Por isso este adapter
     * LÊ a coluna `resultado` da linha retornada — nunca espera exceção
     * para PIN incorreto/bloqueado. `pin_incorreto`/`pin_bloqueado` viram
     * `PinIncorretoError`/`PinBloqueadoError` (carregando
     * `tentativas_restantes`/`bloqueado_ate`, mesmas classes de domínio que
     * `order.mock.ts#confirmPin` lança — paridade de tipo entre os dois
     * adapters). `entregue` → sucesso, `Pedido` final vem de uma RELEITURA
     * real (`fetchPedidoPorId`), mesmo padrão de `create`/`accept`. A RPC
     * NUNCA retorna/expõe `pin_hash`/`pin_texto` na sua saída — a comparação
     * acontece inteiramente dentro da função.
     */
    async confirmPin(pedidoId: string, pin: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('confirmar_pin_pedido', {
        p_pedido_id: pedidoId,
        p_pin: pin,
      });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('PEDIDO_NAO_ENCONTRADO')) throw new PedidoNaoEncontradoError();
        if (message.includes('ACESSO_NEGADO')) throw new AcessoNegadoError();
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError();
        throw error;
      }

      const row = data?.[0];
      if (!row) {
        throw new Error('[core-data/supabase] confirmar_pin_pedido — RPC retornou vazio sem erro.');
      }

      if (row.resultado === 'pin_incorreto') {
        throw new PinIncorretoError(row.tentativas_restantes ?? 0);
      }
      if (row.resultado === 'pin_bloqueado') {
        throw new PinBloqueadoError(row.bloqueado_ate ?? new Date().toISOString());
      }

      const pedido = await fetchPedidoPorId(supabase, pedidoId);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] confirmar_pin_pedido — PIN confirmado mas a releitura não encontrou a linha (RLS bloqueando ou id inesperado).',
        );
      }
      return pedido;
    },

    /** Releitura apenas: nenhum temporizador ou chamada do app confirma pagamento real. */
    async confirmarPagamento(pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const pedido = await fetchPedidoPorId(supabase, pedidoId);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] confirmarPagamento — releitura não encontrou a linha (RLS bloqueando ou id inesperado).',
        );
      }
      return pedido;
    },

    async cancel(pedidoId: string, motivo: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();
      await createSupportSupabase(supabase).abrir({ pedidoId, tipo: 'cancelamento', motivo, operacaoId: createSupportOperationId() });
      const pedido = await fetchPedidoPorId(supabase, pedidoId);
      if (!pedido) throw new Error('PEDIDO_NAO_ENCONTRADO');
      return pedido;
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

    /**
     * Story 6.12 (AC2, AC4). Chama a RPC `SECURITY DEFINER`
     * `avancar_estado_pedido` com `p_novo_status := 'saindo_hub'` — autoriza
     * por ownership (`estabelecimentos.dono_user_id = auth.uid()`) OU
     * `is_admin()`, DENTRO da função; só transiciona a partir de
     * `aceito`/`em_preparo` (dupla-execução vira `TRANSICAO_INVALIDA`, não
     * sucesso silencioso). A RPC retorna SÓ o novo `status` (text, não a
     * linha completa) — o `Pedido` final vem de uma RELEITURA real
     * (`fetchPedidoPorId`), mesmo padrão de `create`/`accept`.
     *
     * Mapeia os 4 erros NOMEADOS (`RAISE EXCEPTION`) para classes dedicadas
     * (`order-errors.ts`) — nunca engole o erro, nunca simula sucesso.
     */
    async markReadyForHub(pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('avancar_estado_pedido', {
        p_pedido_id: pedidoId,
        p_novo_status: 'saindo_hub',
      });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('PEDIDO_NAO_ENCONTRADO')) throw new PedidoNaoEncontradoError();
        if (message.includes('ACESSO_NEGADO')) throw new AcessoNegadoError();
        if (message.includes('TRANSICAO_INVALIDA')) throw new TransicaoInvalidaError();
        throw error;
      }

      if (!data) {
        throw new Error('[core-data/supabase] avancar_estado_pedido — RPC retornou vazio sem erro.');
      }

      const pedido = await fetchPedidoPorId(supabase, pedidoId);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] avancar_estado_pedido — pedido avançado mas a releitura não encontrou a linha (RLS bloqueando ou id inesperado).',
        );
      }
      return pedido;
    },

    /**
     * Story 6.14 (AC2, AC3, AC6) — [IDS] REUSE do padrão de
     * `markReadyForHub` (Story 6.12): mesma RPC `SECURITY DEFINER`
     * `avancar_estado_pedido`, agora com `p_novo_status := 'no_hub'` — a RPC
     * exige origem `status = 'saindo_hub'` e autoriza por ownership
     * (`estabelecimentos.dono_user_id = auth.uid()`) OU `is_admin()`, DENTRO
     * da função; dupla-execução (pedido já `no_hub`) vira
     * `TRANSICAO_INVALIDA`, não sucesso silencioso. A RPC não grava nenhum
     * timestamp de chegada para este alvo (só `status` muda — ver header da
     * migration `20260813022931_rpc_avancar_estado_pedido.sql`, linhas
     * 85-93) — este adapter não referencia nenhuma coluna de chegada. A RPC
     * retorna SÓ o novo `status` (text) — o `Pedido` final vem de uma
     * RELEITURA real (`fetchPedidoPorId`), mesmo padrão de
     * `create`/`accept`/`markReadyForHub`.
     *
     * Mapeia os 4 erros NOMEADOS (`RAISE EXCEPTION`) para classes dedicadas
     * (`order-errors.ts`) — nunca engole o erro, nunca simula sucesso.
     */
    async markArrivedAtHub(pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('avancar_estado_pedido', {
        p_pedido_id: pedidoId,
        p_novo_status: 'no_hub',
      });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('PEDIDO_NAO_ENCONTRADO')) throw new PedidoNaoEncontradoError();
        if (message.includes('ACESSO_NEGADO')) throw new AcessoNegadoError();
        if (message.includes('TRANSICAO_INVALIDA')) throw new TransicaoInvalidaError();
        throw error;
      }

      if (!data) {
        throw new Error('[core-data/supabase] avancar_estado_pedido — RPC retornou vazio sem erro.');
      }

      const pedido = await fetchPedidoPorId(supabase, pedidoId);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] avancar_estado_pedido — pedido avançado mas a releitura não encontrou a linha (RLS bloqueando ou id inesperado).',
        );
      }
      return pedido;
    },

    async markCustomerNoShow(pedidoId: string, motivo: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();
      await createSupportSupabase(supabase).abrir({ pedidoId, tipo: 'cliente_ausente', motivo, operacaoId: createSupportOperationId() });
      const pedido = await fetchPedidoPorId(supabase, pedidoId);
      if (!pedido) throw new Error('PEDIDO_NAO_ENCONTRADO');
      return pedido;
    },

    async advanceStatus(
      _pedidoId: string,
      _nextStatus: AdvanceableStatus,
      _options?: AsyncCallOptions,
    ): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'advanceStatus', EPIC);
    },

    /**
     * Story 6.20 (pré-requisito, ver
     * `20260814000001_pedidos_add_cliente_chegou_em.sql`). Chama a RPC
     * `SECURITY DEFINER` `marcar_cliente_chegou` — autoriza por SESSÃO
     * (`pedidos.cliente_id = auth.uid()`), nunca por um `pedidoId` cru
     * assumido como dono; exige `status = 'no_hub'`. [IDS] ADAPT: fecha o
     * débito técnico registrado pela Story 6.14 (`NotImplementedError`
     * deliberado — cliente_chegou_em não existia no schema do piloto até
     * esta Story). A RPC retorna SÓ o `uuid` — o `Pedido` final vem de uma
     * RELEITURA real (`fetchPedidoPorId`), mesmo padrão de
     * `create`/`accept`/`refuse`.
     */
    async markClienteChegou(pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('marcar_cliente_chegou', {
        p_pedido_id: pedidoId,
      });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('PEDIDO_NAO_ENCONTRADO')) throw new PedidoNaoEncontradoError();
        if (message.includes('ACESSO_NEGADO')) throw new AcessoNegadoError();
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError();
        throw error;
      }

      if (!data) {
        throw new Error('[core-data/supabase] marcar_cliente_chegou — RPC retornou vazio sem erro.');
      }

      const pedido = await fetchPedidoPorId(supabase, data);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] marcar_cliente_chegou — chegada confirmada mas a releitura não encontrou a linha (RLS bloqueando ou id inesperado).',
        );
      }
      return pedido;
    },

    /**
     * Story 6.20 (AC2, AC4). Chama a RPC `SECURITY DEFINER`
     * `reportar_lojista_nao_veio` — autoriza por SESSÃO
     * (`pedidos.cliente_id = auth.uid()`); exige `status = 'no_hub'` E
     * `cliente_chegou_em` preenchido; a RPC reforça SERVER-SIDE a condição de
     * tempo do AC1 (`TEMPO_MINIMO_NAO_ATINGIDO`) — nunca confia só na UI. Em
     * sucesso, na MESMA transação da RPC: transição + refund 100% pendente +
     * falha de qualidade do lojista — este adapter só chama a RPC e relê.
     *
     * Mapeia os 5 erros NOMEADOS (`RAISE EXCEPTION`) para classes dedicadas
     * (`order-errors.ts`) — nunca engole o erro, nunca simula sucesso.
     */
    async reportLojistaNaoVeio(pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('reportar_lojista_nao_veio', {
        p_pedido_id: pedidoId,
      });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('PEDIDO_NAO_ENCONTRADO')) throw new PedidoNaoEncontradoError();
        if (message.includes('ACESSO_NEGADO')) throw new AcessoNegadoError();
        if (message.includes('TEMPO_MINIMO_NAO_ATINGIDO')) throw new TempoMinimoNaoAtingidoError();
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError();
        throw error;
      }

      if (!data) {
        throw new Error('[core-data/supabase] reportar_lojista_nao_veio — RPC retornou vazio sem erro.');
      }

      const pedido = await fetchPedidoPorId(supabase, data);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] reportar_lojista_nao_veio — reportado mas a releitura não encontrou a linha (RLS bloqueando ou id inesperado).',
        );
      }
      return pedido;
    },

    /**
     * Story 6.21 (AC2, AC3). Chama a RPC `SECURITY DEFINER`
     * `cancelar_pedido_atraso` — autoriza por SESSÃO
     * (`pedidos.cliente_id = auth.uid()`); exige `status IN ('aceito',
     * 'em_preparo')`; a RPC reforça SERVER-SIDE a condição de atraso do AC1
     * (`ATRASO_NAO_CONFIRMADO` se chamada antes de `aceito_em + 2 *
     * tempo_estimado_min`) — nunca confia só no client ter mostrado o
     * prompt. Em sucesso, na MESMA transação da RPC: transição + refund 100%
     * pendente + falha de qualidade do lojista — este adapter só chama a RPC
     * e relê.
     *
     * Mapeia os 5 erros NOMEADOS (`RAISE EXCEPTION`) para classes dedicadas
     * (`order-errors.ts`) — nunca engole o erro, nunca simula sucesso.
     */
    async cancelPedidoAtraso(pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('cancelar_pedido_atraso', {
        p_pedido_id: pedidoId,
      });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('PEDIDO_NAO_ENCONTRADO')) throw new PedidoNaoEncontradoError();
        if (message.includes('ACESSO_NEGADO')) throw new AcessoNegadoError();
        if (message.includes('ATRASO_NAO_CONFIRMADO')) throw new AtrasoNaoConfirmadoError();
        if (message.includes('ESTADO_INVALIDO')) throw new EstadoInvalidoError();
        throw error;
      }

      if (!data) {
        throw new Error('[core-data/supabase] cancelar_pedido_atraso — RPC retornou vazio sem erro.');
      }

      const pedido = await fetchPedidoPorId(supabase, data);
      if (!pedido) {
        throw new Error(
          '[core-data/supabase] cancelar_pedido_atraso — cancelado mas a releitura não encontrou a linha (RLS bloqueando ou id inesperado).',
        );
      }
      return pedido;
    },
  };
}
