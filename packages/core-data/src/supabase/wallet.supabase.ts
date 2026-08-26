import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { CarteiraLojista, Saque, SaqueStatus, WalletPort } from '../ports/wallet.port';
import type { AsyncCallOptions } from '../types';
import {
  AutenticacaoNecessariaError,
  EstabelecimentoNaoEncontradoError,
  SaldoInsuficienteError,
  ValorMinimoSaqueError,
} from './wallet-errors';

const CARTEIRA_COLUMNS =
  'estabelecimento_id, saldo_disponivel_reais, saldo_bloqueado_reais, total_sacado_reais, total_debitado_reais';

export const LANCAMENTO_COLUMNS = 'id, estabelecimento_id, valor_centavos, status, criado_em, concluido_em';

type CarteiraRow = {
  estabelecimento_id: string;
  saldo_disponivel_reais: number;
  saldo_bloqueado_reais: number;
  total_sacado_reais: number;
  total_debitado_reais: number;
};

export type LancamentoRow = {
  id: string;
  estabelecimento_id: string;
  valor_centavos: number;
  status: string;
  criado_em: string;
  concluido_em: string | null;
};

/**
 * Story 7.7 (mapeamento ledger → `Saque`, [AUTO-DECISION] registrado em
 * `docs/stories/7.7.story.md#Dependencies`): `lancamentos_financeiros.status`
 * só tem 3 valores (`pendente|concluido|erro`) — o piloto não modela o passo
 * intermediário `'processando'` do contrato `SaqueStatus` (4 valores). Mapeia
 * `'pendente'` → `'solicitado'` (honesto: o lojista solicitou, aguarda o
 * Admin executar o PIX manual, Bloco 09) — `'processando'` permanece um
 * valor válido do TIPO mas nunca é PRODUZIDO por este adapter.
 */
export const STATUS_MAP: Record<string, SaqueStatus> = {
  pendente: 'solicitado',
  concluido: 'concluido',
  erro: 'erro',
};

export function mapLancamentoToSaque(row: LancamentoRow): Saque {
  return {
    id: row.id,
    estabelecimento_id: row.estabelecimento_id,
    valor_reais: Math.abs(row.valor_centavos) / 100,
    status: STATUS_MAP[row.status] ?? 'erro',
    solicitado_em: row.criado_em,
    processado_em: null,
    concluido_em: row.concluido_em,
  };
}

function carteiraZerada(estabelecimentoId: string): CarteiraLojista {
  return {
    estabelecimento_id: estabelecimentoId,
    saldo_disponivel_reais: 0,
    saldo_bloqueado_reais: 0,
    total_sacado_reais: 0,
    total_debitado_reais: 0,
  };
}

/**
 * Implementação real de `WalletPort` (Stories 7.7/7.8) — carteira do lojista.
 * `getBalance`/`statement` leem, respectivamente, a view `carteira_lojista` e
 * o ledger `lancamentos_financeiros` (Story 7.6, RLS já garante isolamento
 * por `estabelecimento_id` — o adapter não reimplementa a checagem de
 * ownership). `requestWithdrawal` chama a RPC `SECURITY DEFINER`
 * `solicitar_saque(p_valor_centavos)` (Story 7.8, já aplicada via MCP).
 */
export function createWalletSupabase(client?: SupabaseClient<Database>): WalletPort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    /**
     * Story 7.7 (AC1, AC4, AC5). Consulta a view `carteira_lojista`
     * filtrando por `estabelecimento_id` — a RLS da view (`security_invoker`
     * + `WHERE` dono/admin, Story 7.6 AC3/AC4) garante que o lojista só
     * enxerga a própria carteira. Um lojista sem nenhum lançamento (ou cujo
     * `estabelecimento` não bate o `WHERE e.status = 'ativo'` da view)
     * resolve saldo ZERO honesto (`maybeSingle()` retorna `null`, não erro)
     * — nunca lança nesse caso; qualquer erro real de rede/RLS (`error`
     * preenchido) SEMPRE propaga, nunca vira sucesso fictício.
     */
    async getBalance(estabelecimentoId: string, _options?: AsyncCallOptions): Promise<CarteiraLojista> {
      const supabase = resolveClient();

      const { data, error } = await supabase
        .from('carteira_lojista')
        .select(CARTEIRA_COLUMNS)
        .eq('estabelecimento_id', estabelecimentoId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!data) {
        return carteiraZerada(estabelecimentoId);
      }

      const row = data as unknown as CarteiraRow;
      return {
        estabelecimento_id: row.estabelecimento_id,
        saldo_disponivel_reais: Number(row.saldo_disponivel_reais),
        saldo_bloqueado_reais: Number(row.saldo_bloqueado_reais),
        total_sacado_reais: Number(row.total_sacado_reais),
        total_debitado_reais: Number(row.total_debitado_reais),
      };
    },

    /**
     * Story 7.8 (AC1, AC2, AC3, AC4, AC6). Converte `valorReais → centavos`
     * (`Math.round(valorReais * 100)`, nunca ponto flutuante cru na chamada)
     * e chama a RPC `solicitar_saque(p_valor_centavos)` — validação de
     * sessão/ownership/mínimo/saldo é INTEIRAMENTE server-side (a RPC relê
     * `carteira_lojista.saldo_disponivel_reais` dentro de si, serializando
     * saques concorrentes do mesmo lojista via `FOR UPDATE`). Mapeia os 4
     * erros NOMEADOS reais para classes dedicadas (`wallet-errors.ts`) —
     * nunca engole o erro, nunca simula sucesso. Sucesso = `payout`
     * `status = 'pendente'` (NÃO dispara PIX real — o Admin executa
     * manualmente no Bloco 09).
     */
    async requestWithdrawal(
      estabelecimentoId: string,
      valorReais: number,
      _options?: AsyncCallOptions,
    ): Promise<Saque> {
      const supabase = resolveClient();
      const valorCentavos = Math.round(valorReais * 100);

      const { data, error } = await supabase.rpc('solicitar_saque', { p_valor_centavos: valorCentavos });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('ESTABELECIMENTO_NAO_ENCONTRADO')) throw new EstabelecimentoNaoEncontradoError();
        if (message.includes('VALOR_MINIMO_SAQUE')) throw new ValorMinimoSaqueError();
        if (message.includes('SALDO_INSUFICIENTE')) throw new SaldoInsuficienteError();
        throw error;
      }

      const row = data?.[0];
      if (!row) {
        throw new Error('[core-data/supabase] solicitar_saque — RPC retornou vazio sem erro.');
      }

      return mapLancamentoToSaque({
        id: row.lancamento_id,
        estabelecimento_id: row.estabelecimento_id ?? estabelecimentoId,
        valor_centavos: Number(row.valor_centavos),
        status: row.status,
        criado_em: row.solicitado_em,
        concluido_em: null,
      });
    },

    /**
     * Story 7.7 (AC2, AC3, AC5). Consulta `lancamentos_financeiros WHERE
     * tipo = 'payout' AND estabelecimento_id = :id`, ordenado por
     * `criado_em DESC` (mesmo índice `idx_lancamentos_estab`), mapeado para
     * `Saque[]` conforme o mapeamento documentado acima. RLS (Story 7.6
     * AC4) já garante isolamento por `estabelecimento_id` — o adapter não
     * reimplementa a checagem de ownership.
     */
    async statement(estabelecimentoId: string, _options?: AsyncCallOptions): Promise<Saque[]> {
      const supabase = resolveClient();

      const { data, error } = await supabase
        .from('lancamentos_financeiros')
        .select(LANCAMENTO_COLUMNS)
        .eq('estabelecimento_id', estabelecimentoId)
        .eq('tipo', 'payout')
        .order('criado_em', { ascending: false });
      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as LancamentoRow[];
      return rows.map(mapLancamentoToSaque);
    },
  };
}
