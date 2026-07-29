import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  AnalyticsPort,
  MovimentacaoExtrato,
  PeriodoVendas,
  TopProdutoEntry,
  VendasPeriodoResumo,
} from '../ports/analytics.port';
import type { AsyncCallOptions } from '../types';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'analytics';
const EPIC = 'Épico 7';

/**
 * Esqueleto Supabase de `AnalyticsPort` (Story 1.9). Vendas/extrato do
 * Lojista é Pagamento & Carteira (Épico 7) — mesmo agrupamento de
 * `WalletPort`, ver justificativa de `CREATE` (não `ADAPT`/`REUSE`) no
 * cabeçalho de `ports/analytics.port.ts` (Story 1.10).
 */
export function createAnalyticsSupabase(client?: SupabaseClient<Database>): AnalyticsPort {
  // Lazy: só instancia um `SupabaseClient` de verdade se algum método
  // precisar (nenhum stub abaixo precisa hoje). Evita exigir
  // `SUPABASE_URL`/`SUPABASE_ANON_KEY` em ambientes (ex.: CI de
  // typecheck/test) que só verificam o contrato do esqueleto.
  const resolveClient = (): SupabaseClient<Database> => client ?? createClient();
  void resolveClient;

  return {
    async salesSummary(
      _estabelecimentoId: string,
      _periodo: PeriodoVendas,
      _options?: AsyncCallOptions,
    ): Promise<VendasPeriodoResumo> {
      throw new NotImplementedError(PORT, 'salesSummary', EPIC);
    },

    async topProducts(
      _estabelecimentoId: string,
      _periodo: PeriodoVendas,
      _options?: AsyncCallOptions,
    ): Promise<TopProdutoEntry[]> {
      throw new NotImplementedError(PORT, 'topProducts', EPIC);
    },

    async monthlyStatement(
      _estabelecimentoId: string,
      _options?: AsyncCallOptions,
    ): Promise<MovimentacaoExtrato[]> {
      throw new NotImplementedError(PORT, 'monthlyStatement', EPIC);
    },
  };
}
