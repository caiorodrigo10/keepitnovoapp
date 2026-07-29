import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { AdvanceableStatus, CreatePedidoInput, OrderPort, Pedido } from '../ports/order.port';
import type { AsyncCallOptions } from '../types';
import { NotImplementedError } from './not-implemented-error';

const PORT = 'order';
const EPIC = 'Épico 6';

/**
 * Esqueleto Supabase de `OrderPort` (Story 1.9). Pedido & PIN — fluxo
 * completo (Cliente + Lojista) — é o Épico 6.
 */
export function createOrderSupabase(client?: SupabaseClient<Database>): OrderPort {
  // Lazy: só instancia um `SupabaseClient` de verdade se algum método
  // precisar (nenhum stub abaixo precisa hoje). Evita exigir
  // `SUPABASE_URL`/`SUPABASE_ANON_KEY` em ambientes (ex.: CI de
  // typecheck/test) que só verificam o contrato do esqueleto.
  const resolveClient = (): SupabaseClient<Database> => client ?? createClient();
  void resolveClient;

  return {
    async create(_input: CreatePedidoInput, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'create', EPIC);
    },

    async listMine(_clienteId: string, _options?: AsyncCallOptions): Promise<Pedido[]> {
      throw new NotImplementedError(PORT, 'listMine', EPIC);
    },

    async getById(_pedidoId: string, _options?: AsyncCallOptions): Promise<Pedido | null> {
      throw new NotImplementedError(PORT, 'getById', EPIC);
    },

    async accept(_pedidoId: string, _tempoEstimadoMin: number, _options?: AsyncCallOptions): Promise<Pedido> {
      throw new NotImplementedError(PORT, 'accept', EPIC);
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

    async listByEstabelecimento(_estabelecimentoId: string, _options?: AsyncCallOptions): Promise<Pedido[]> {
      throw new NotImplementedError(PORT, 'listByEstabelecimento', EPIC);
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
