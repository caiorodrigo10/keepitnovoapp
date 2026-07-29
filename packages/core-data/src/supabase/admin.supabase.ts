import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  AdminPort,
  CreateHubInput,
  EstabelecimentoFalha,
  FinancialDashboardResult,
  ReembolsoPendente,
  UpdateHubInput,
} from '../ports/admin.port';
import type { Cliente } from '../ports/auth.port';
import type { Hub } from '../ports/hub.port';
import type { Pedido, PedidoStatus } from '../ports/order.port';
import type { Estabelecimento } from '../ports/store.port';
import type { AsyncCallOptions } from '../types';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'admin';

/**
 * Esqueleto Supabase de `AdminPort` (Story 1.9). Ao contrário das demais
 * ports, `AdminPort` mistura responsabilidades de 3 épicos diferentes — o
 * `epicHint` de cada `NotImplementedError` reflete o épico do MÉTODO
 * específico (não um único hint fixo para o arquivo inteiro):
 * - `pendingStores`/`approve`/`reject` → Épico 3 (aprovação de lojista)
 * - `hubsCrud.*` → Épico 4 (cadastro de hubs)
 * - demais métodos (`refundQueue`, `listClientes`, `blockCliente`,
 *   `unblockCliente`, `listAllEstabelecimentos`, `suspendLojista`,
 *   `lojistaQualityView`, `financialDashboard`, `listAllOrders`,
 *   `forceCancelOrder`) → Épico 8 (Painel Admin — Operação)
 */
export function createAdminSupabase(client?: SupabaseClient<Database>): AdminPort {
  // Lazy: só instancia um `SupabaseClient` de verdade se algum método
  // precisar (nenhum stub abaixo precisa hoje). Evita exigir
  // `SUPABASE_URL`/`SUPABASE_ANON_KEY` em ambientes (ex.: CI de
  // typecheck/test) que só verificam o contrato do esqueleto.
  const resolveClient = (): SupabaseClient<Database> => client ?? createClient();
  void resolveClient;

  return {
    async pendingStores(_options?: AsyncCallOptions): Promise<Estabelecimento[]> {
      throw new NotImplementedError(PORT, 'pendingStores', 'Épico 3');
    },

    async approve(_estabelecimentoId: string, _options?: AsyncCallOptions): Promise<Estabelecimento> {
      throw new NotImplementedError(PORT, 'approve', 'Épico 3');
    },

    async reject(_estabelecimentoId: string, _motivo: string, _options?: AsyncCallOptions): Promise<Estabelecimento> {
      throw new NotImplementedError(PORT, 'reject', 'Épico 3');
    },

    hubsCrud: {
      async create(_input: CreateHubInput, _options?: AsyncCallOptions): Promise<Hub> {
        throw new NotImplementedError(PORT, 'hubsCrud.create', 'Épico 4');
      },

      async update(_id: string, _input: UpdateHubInput, _options?: AsyncCallOptions): Promise<Hub> {
        throw new NotImplementedError(PORT, 'hubsCrud.update', 'Épico 4');
      },

      async delete(_id: string, _options?: AsyncCallOptions): Promise<void> {
        throw new NotImplementedError(PORT, 'hubsCrud.delete', 'Épico 4');
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
