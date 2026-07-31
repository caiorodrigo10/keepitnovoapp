import type { Cliente } from '../ports/auth.port';
import type {
  AdminPort,
  CreateHubInput,
  EstabelecimentoFalha,
  FinancialDashboardResult,
  FinancialRankingEntry,
  ReembolsoPendente,
  UpdateHubInput,
} from '../ports/admin.port';
import type { Hub } from '../ports/hub.port';
import type { Pedido, PedidoStatus } from '../ports/order.port';
import type { Estabelecimento } from '../ports/store.port';
import type { AsyncCallOptions } from '../types';
import { generateMockId, simulateAsync } from './async-helpers';
import type { MockDb } from './db';
import { registrarReembolso } from './refund-helpers';

const TERMINAL_PEDIDO_STATUSES: ReadonlySet<PedidoStatus> = new Set([
  'entregue',
  'cancelado',
  'cancelado_timeout',
  'cancelado_atraso',
  'cancelado_admin',
  'recusado',
  'nao_retirado',
  'nao_entregue_lojista',
  'estornado_chargeback',
]);

export function createAdminMock(db: MockDb): AdminPort {
  function findEstabelecimentoOrThrow(id: string): Estabelecimento {
    const estabelecimento = db.estabelecimentos.find((e) => e.id === id);
    if (!estabelecimento) {
      throw new Error(`[mock] Estabelecimento não encontrado: ${id}`);
    }
    return estabelecimento;
  }

  function findHubOrThrow(id: string): Hub {
    const hub = db.hubs.find((h) => h.id === id);
    if (!hub) {
      throw new Error(`[mock] Hub não encontrado: ${id}`);
    }
    return hub;
  }

  function findReembolsoOrThrow(id: string): ReembolsoPendente {
    const reembolso = db.reembolsos.find((r) => r.id === id);
    if (!reembolso) {
      throw new Error(`[mock] Reembolso pendente não encontrado: ${id}`);
    }
    return reembolso;
  }

  function findClienteOrThrow(id: string): Cliente {
    const cliente = db.clientes.find((c) => c.id === id);
    if (!cliente) {
      throw new Error(`[mock] Cliente não encontrado: ${id}`);
    }
    return cliente;
  }

  function findPedidoOrThrow(id: string): Pedido {
    const pedido = db.pedidos.find((p) => p.id === id);
    if (!pedido) {
      throw new Error(`[mock] Pedido não encontrado: ${id}`);
    }
    return pedido;
  }

  return {
    pendingStores(options?: AsyncCallOptions): Promise<Estabelecimento[]> {
      return simulateAsync(
        () => db.estabelecimentos.filter((e) => e.status === 'em_analise'),
        [],
        options,
      );
    },

    approve(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Estabelecimento> {
      return simulateAsync(
        () => {
          const estabelecimento = findEstabelecimentoOrThrow(estabelecimentoId);
          estabelecimento.status = 'ativo';
          estabelecimento.motivo_rejeicao = null;
          return estabelecimento;
        },
        {} as Estabelecimento,
        options,
      );
    },

    reject(estabelecimentoId: string, motivo: string, options?: AsyncCallOptions): Promise<Estabelecimento> {
      return simulateAsync(
        () => {
          const estabelecimento = findEstabelecimentoOrThrow(estabelecimentoId);
          estabelecimento.status = 'rejeitado';
          estabelecimento.motivo_rejeicao = motivo;
          return estabelecimento;
        },
        {} as Estabelecimento,
        options,
      );
    },

    hubsCrud: {
      create(input: CreateHubInput, options?: AsyncCallOptions): Promise<Hub> {
        return simulateAsync(
          () => {
            const hub: Hub = {
              id: generateMockId('hub'),
              nome: input.nome,
              endereco: input.endereco,
              lat: input.lat,
              lng: input.lng,
              ponto_referencia: input.ponto_referencia ?? null,
              foto_url: input.foto_url ?? null,
              ativo: true,
              horarios: input.horarios,
            };
            db.hubs.push(hub);
            return hub;
          },
          {} as Hub,
          options,
        );
      },

      update(id: string, input: UpdateHubInput, options?: AsyncCallOptions): Promise<Hub> {
        return simulateAsync(
          () => {
            const hub = findHubOrThrow(id);
            Object.assign(hub, input);
            return hub;
          },
          {} as Hub,
          options,
        );
      },

      delete(id: string, options?: AsyncCallOptions): Promise<void> {
        return simulateAsync(
          () => {
            const index = db.hubs.findIndex((h) => h.id === id);
            if (index === -1) {
              throw new Error(`[mock] Hub não encontrado: ${id}`);
            }
            db.hubs.splice(index, 1);
          },
          undefined,
          options,
        );
      },
    },

    refundQueue: {
      list(options?: AsyncCallOptions): Promise<ReembolsoPendente[]> {
        return simulateAsync(() => db.reembolsos.filter((r) => r.status === 'pendente_admin'), [], options);
      },

      process(id: string, options?: AsyncCallOptions): Promise<ReembolsoPendente> {
        return simulateAsync(
          () => {
            const reembolso = findReembolsoOrThrow(id);
            reembolso.status = 'estornado';
            return reembolso;
          },
          {} as ReembolsoPendente,
          options,
        );
      },
    },

    // -----------------------------------------------------------------
    // Admin-ops (Story 1.10, Task 4 — promovido de
    // `apps/admin/src/mock/adminOpsMock.ts`, Story 0.13)
    // -----------------------------------------------------------------

    listClientes(filtros?: { busca?: string }, options?: AsyncCallOptions): Promise<Cliente[]> {
      return simulateAsync(
        () => {
          const busca = filtros?.busca?.trim().toLowerCase();
          if (!busca) {
            return db.clientes;
          }
          return db.clientes.filter(
            // Story 2.3: `telefone` ficou nullable no schema físico (decisão 10.4).
            (c) => c.nome.toLowerCase().includes(busca) || (c.telefone?.includes(busca) ?? false),
          );
        },
        [],
        options,
      );
    },

    blockCliente(clienteId: string, motivo: string, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        () => {
          const cliente = findClienteOrThrow(clienteId);
          cliente.bloqueado = true;
          cliente.motivo_bloqueio = motivo;
          return cliente;
        },
        {} as Cliente,
        options,
      );
    },

    unblockCliente(clienteId: string, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        () => {
          const cliente = findClienteOrThrow(clienteId);
          cliente.bloqueado = false;
          cliente.motivo_bloqueio = null;
          return cliente;
        },
        {} as Cliente,
        options,
      );
    },

    listAllEstabelecimentos(options?: AsyncCallOptions): Promise<Estabelecimento[]> {
      return simulateAsync(() => db.estabelecimentos, [], options);
    },

    suspendLojista(estabelecimentoId: string, motivo: string, options?: AsyncCallOptions): Promise<Estabelecimento> {
      return simulateAsync(
        () => {
          const estabelecimento = findEstabelecimentoOrThrow(estabelecimentoId);
          if (estabelecimento.status !== 'ativo') {
            throw new Error(
              `[mock] Estabelecimento ${estabelecimento.nome_fantasia} não pode ser suspenso a partir do status "${estabelecimento.status}"`,
            );
          }
          estabelecimento.status = 'suspenso';
          estabelecimento.motivo_suspensao = motivo;
          return estabelecimento;
        },
        {} as Estabelecimento,
        options,
      );
    },

    lojistaQualityView(estabelecimentoId: string, options?: AsyncCallOptions): Promise<EstabelecimentoFalha[]> {
      return simulateAsync(
        () =>
          db.falhas
            .filter((f) => f.estabelecimento_id === estabelecimentoId)
            .sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
        [],
        options,
      );
    },

    financialDashboard(periodoDias: number, options?: AsyncCallOptions): Promise<FinancialDashboardResult> {
      return simulateAsync(
        () => {
          const limite = new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000);

          const pedidosEntreguesNoPeriodo = db.pedidos.filter(
            (p) => p.status === 'entregue' && p.entregue_em !== null && new Date(p.entregue_em) >= limite,
          );

          const gmvReais = pedidosEntreguesNoPeriodo.reduce((sum, p) => sum + p.total_pago_reais, 0);
          const receitaKeepitReais = pedidosEntreguesNoPeriodo.reduce((sum, p) => sum + p.taxa_keepit_reais, 0);

          const porLoja = new Map<string, { gmvReais: number; pedidosEntregues: number }>();
          for (const pedido of pedidosEntreguesNoPeriodo) {
            const atual = porLoja.get(pedido.estabelecimento_id) ?? { gmvReais: 0, pedidosEntregues: 0 };
            atual.gmvReais += pedido.total_pago_reais;
            atual.pedidosEntregues += 1;
            porLoja.set(pedido.estabelecimento_id, atual);
          }

          const ranking: FinancialRankingEntry[] = [...porLoja.entries()]
            .map(([estabelecimento_id, agregado]) => ({
              estabelecimento_id,
              nome_fantasia:
                db.estabelecimentos.find((e) => e.id === estabelecimento_id)?.nome_fantasia ?? estabelecimento_id,
              gmvReais: agregado.gmvReais,
              pedidosEntregues: agregado.pedidosEntregues,
            }))
            .sort((a, b) => b.gmvReais - a.gmvReais);

          return { periodoDias, gmvReais, receitaKeepitReais, ranking };
        },
        { periodoDias, gmvReais: 0, receitaKeepitReais: 0, ranking: [] },
        options,
      );
    },

    listAllOrders(filtros?: { status?: PedidoStatus }, options?: AsyncCallOptions): Promise<Pedido[]> {
      return simulateAsync(
        () => {
          const pedidos = filtros?.status ? db.pedidos.filter((p) => p.status === filtros.status) : db.pedidos;
          return [...pedidos].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
        },
        [],
        options,
      );
    },

    forceCancelOrder(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido> {
      return simulateAsync(
        () => {
          const pedido = findPedidoOrThrow(pedidoId);
          if (TERMINAL_PEDIDO_STATUSES.has(pedido.status)) {
            throw new Error(`[mock] Pedido ${pedido.numero} já está em estado terminal (${pedido.status})`);
          }

          pedido.status = 'cancelado_admin';
          pedido.motivo_cancelamento = motivo;
          pedido.cancelado_em = new Date().toISOString();
          registrarReembolso(db, pedido, 'cancelamento_admin');

          return pedido;
        },
        {} as Pedido,
        options,
      );
    },
  };
}
