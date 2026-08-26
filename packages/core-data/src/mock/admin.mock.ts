import type { Cliente } from '../ports/auth.port';
import type {
  AdminPort,
  CreateHubInput,
  EstabelecimentoAdmin,
  EstabelecimentoFalha,
  FinancialDashboardResult,
  FinancialRankingEntry,
  HubFotoUploadInput,
  LancamentoConfirmResultado,
  ReembolsoPendente,
  UpdateHubInput,
} from '../ports/admin.port';
import type { Hub } from '../ports/hub.port';
import type { Pedido, PedidoStatus } from '../ports/order.port';
import type { Estabelecimento } from '../ports/store.port';
import type { Saque } from '../ports/wallet.port';
import type { AsyncCallOptions } from '../types';
import { generateMockId, simulateAsync } from './async-helpers';
import type { MockDb } from './db';
import { estabelecimentosAdminExtraFixture } from './fixtures/estabelecimentos-admin';
import { registrarReembolso } from './refund-helpers';

/**
 * Status de `pedidos` (Story 8.4/8.8) tratados como "cancelamento" para fins
 * de contagem de qualidade (`lojistaOrderCounts`) e de taxa de sucesso do
 * dashboard (`financialDashboard`) — [AUTO-DECISION] inclui todos os
 * `cancelado*`/`recusado`/`estornado_chargeback`; EXCLUI `nao_retirado`/
 * `nao_entregue_lojista` (contados à parte, como `noShow`, ver
 * `NO_SHOW_PEDIDO_STATUSES` abaixo) — mesma distinção operacional da matriz
 * de reembolso (`docs/PERGUNTAS_REGRAS_NEGOCIO.md` Rodada 2): cancelamento e
 * no-show são causas diferentes, o admin precisa distingui-las para decidir
 * suspensão.
 */
const CANCELADO_PEDIDO_STATUSES: ReadonlySet<PedidoStatus> = new Set([
  'cancelado',
  'cancelado_timeout',
  'cancelado_atraso',
  'cancelado_admin',
  'recusado',
  'estornado_chargeback',
]);

const NO_SHOW_PEDIDO_STATUSES: ReadonlySet<PedidoStatus> = new Set(['nao_retirado', 'nao_entregue_lojista']);

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

  /**
   * Story 3.7 (AC2, AC3) — combina `Estabelecimento` (fixtures base,
   * `estabelecimentosFixture`) com o índice paralelo mock-only
   * `estabelecimentosAdminExtraFixture`. Lança se a extensão administrativa
   * não existir para o `id` — sinal honesto de fixture incompleta, nunca um
   * `EstabelecimentoAdmin` com campos inventados/vazios silenciosamente.
   */
  function toEstabelecimentoAdmin(estabelecimento: Estabelecimento): EstabelecimentoAdmin {
    const extra = estabelecimentosAdminExtraFixture[estabelecimento.id];
    if (!extra) {
      throw new Error(
        `[mock] Dados administrativos ausentes para estabelecimento ${estabelecimento.id} — adicionar em estabelecimentos-admin.ts`,
      );
    }
    return { ...estabelecimento, ...extra };
  }

  return {
    pendingStores(options?: AsyncCallOptions): Promise<EstabelecimentoAdmin[]> {
      return simulateAsync(
        () => db.estabelecimentos.filter((e) => e.status === 'em_analise').map(toEstabelecimentoAdmin),
        [],
        options,
      );
    },

    /**
     * Story 3.7 (AC3). Mock não tem Storage real — `foto_fachada_url_assinada`
     * simplesmente reaproveita `foto_fachada_url` (já uma URL pública
     * completa do Unsplash nas fixtures, ver `fixtures/estabelecimentos.ts`),
     * documentado como simplificação honesta do mock (não simula um endpoint
     * de assinatura que não existe neste modo).
     */
    pendingStoreDetail(id: string, options?: AsyncCallOptions): Promise<EstabelecimentoAdmin | null> {
      return simulateAsync(
        () => {
          const estabelecimento = db.estabelecimentos.find((e) => e.id === id);
          if (!estabelecimento) {
            return null;
          }
          const admin = toEstabelecimentoAdmin(estabelecimento);
          return { ...admin, foto_fachada_url_assinada: admin.foto_fachada_url };
        },
        null,
        options,
      );
    },

    /**
     * Story 3.8 — comportamento herdado do Épico 0 (Story 0.12), sem mudança
     * nesta Story: `AdminPort.approve` devolve `Estabelecimento` (tipo
     * base), que não inclui `aprovado_em`/`aprovado_por` — esses 2 campos só
     * existem em `EstabelecimentoAdmin` (`pendingStores`/
     * `pendingStoreDetail`). [AUTO-DECISION] Não gravar `aprovado_em`/
     * `aprovado_por` em `estabelecimentosAdminExtraFixture` aqui → (reason:
     * esse índice é um módulo compartilhado, NÃO clonado por
     * `createMockDb()` — Story 0.2 clona `db.estabelecimentos` via
     * `structuredClone` exatamente para isolar mutação entre testes;
     * mutar o índice extra vazaria estado entre `it()` blocks/arquivos de
     * teste que importam o mesmo módulo, sem nenhuma AC desta Story exigindo
     * esse dado no retorno de `approve`).
     */
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
      /**
       * [AUTO-DECISION] Sem filtro de `ativo` — paridade mock com a decisão
       * de escopo de leitura administrativa da Story 4.1 (ver JSDoc de
       * `AdminPort.hubsCrud.list`): distinta de `hub.mock.ts#listNearby`,
       * que continua filtrando `ativo = true` para a Descoberta pública. O
       * Admin precisa ver e reativar hubs desativados (AC1).
       */
      list(options?: AsyncCallOptions): Promise<Hub[]> {
        return simulateAsync(() => db.hubs, [], options);
      },

      getById(id: string, options?: AsyncCallOptions): Promise<Hub | null> {
        return simulateAsync(() => db.hubs.find((h) => h.id === id) ?? null, null, options);
      },

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

      /**
       * [AUTO-DECISION] Mock não tem Storage real — devolve a própria `uri`
       * recebida (mesma simplificação honesta já usada em
       * `pendingStoreDetail`, que reaproveita `foto_fachada_url` como
       * "assinada", Story 3.7): no Admin web `uri` já é uma Blob URL
       * (`URL.createObjectURL(file)`) válida no navegador da sessão atual,
       * então o preview/gravação em `db.hubs[].foto_url` continua
       * funcional para fins de demo, sem simular um endpoint de upload que
       * não existe neste modo.
       */
      uploadFoto(input: HubFotoUploadInput, options?: AsyncCallOptions): Promise<string> {
        return simulateAsync(() => input.uri, '', options);
      },
    },

    refundQueue: {
      list(options?: AsyncCallOptions): Promise<ReembolsoPendente[]> {
        return simulateAsync(
          () =>
            db.reembolsos
              .filter((r) => r.status === 'pendente_admin')
              .sort((a, b) => a.criado_em.localeCompare(b.criado_em)),
          [],
          options,
        );
      },

      /**
       * Story 8.2 (AC2) — assinatura estendida com `resultado`/`detalhe`
       * (`_detalhe` não é modelado em `ReembolsoPendente`, tipo de UI sem
       * coluna de detalhe — mesma simplificação honesta já aplicada em
       * outros pontos do mock; o adapter Supabase real grava `detalhe` no
       * ledger, mas o retorno mapeado para `ReembolsoPendente` também não o
       * expõe). `resultado === 'erro'` mapeia para `status: 'erro'` (nunca
       * um sucesso fictício); `'concluido'` mapeia para `'estornado'`
       * (rótulo de UI já existente, ver Story 8.1 mapeamento status).
       */
      process(
        id: string,
        resultado: LancamentoConfirmResultado,
        _detalhe?: string,
        options?: AsyncCallOptions,
      ): Promise<ReembolsoPendente> {
        return simulateAsync(
          () => {
            const reembolso = findReembolsoOrThrow(id);
            reembolso.status = resultado === 'erro' ? 'erro' : 'estornado';
            return reembolso;
          },
          {} as ReembolsoPendente,
          options,
        );
      },
    },

    payoutQueue: {
      /**
       * Story 8.9 — [IDS] REUSE de `db.saques` (mesma coleção mock que
       * `wallet.mock.ts#requestWithdrawal` já popula com `status:
       * 'solicitado'`, ver Dev Notes da Story). Filtra os pendentes
       * (`'solicitado'` = ângulo do lojista para o mesmo estado que o
       * ledger real chama `'pendente'`), ordenados por `solicitado_em asc`
       * — mesma ordenação de `refundQueue.list`.
       */
      list(options?: AsyncCallOptions): Promise<Saque[]> {
        return simulateAsync(
          () =>
            db.saques
              .filter((s) => s.status === 'solicitado')
              .sort((a, b) => a.solicitado_em.localeCompare(b.solicitado_em)),
          [],
          options,
        );
      },

      process(
        id: string,
        resultado: LancamentoConfirmResultado,
        _detalhe?: string,
        options?: AsyncCallOptions,
      ): Promise<Saque> {
        return simulateAsync(
          () => {
            const saque = db.saques.find((s) => s.id === id);
            if (!saque) {
              throw new Error(`[mock] Saque não encontrado: ${id}`);
            }
            saque.status = resultado === 'erro' ? 'erro' : 'concluido';
            saque.concluido_em = new Date().toISOString();
            return saque;
          },
          {} as Saque,
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

    /**
     * Story 8.6 (AC4) — [IDS] CREATE, capacidade nova. Guarda simétrica a
     * `suspendLojista`: só reativa quem está `suspenso` (nunca promove
     * `em_analise`/`rejeitado`, evitando pular `approve`). [AUTO-DECISION]
     * limpa `motivo_suspensao` ao reativar (não preserva como histórico) —
     * mesma decisão aplicada na RPC real (`20260813070004`), sem
     * `suspenso_em` no tipo `Estabelecimento` (a port não modela essa
     * coluna administrativa — ver JSDoc de `EstabelecimentoAdmin`).
     */
    reactivateLojista(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Estabelecimento> {
      return simulateAsync(
        () => {
          const estabelecimento = findEstabelecimentoOrThrow(estabelecimentoId);
          if (estabelecimento.status !== 'suspenso') {
            throw new Error(
              `[mock] Estabelecimento ${estabelecimento.nome_fantasia} não pode ser reativado a partir do status "${estabelecimento.status}"`,
            );
          }
          estabelecimento.status = 'ativo';
          estabelecimento.motivo_suspensao = null;
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

    /** Story 8.8 (AC1) — ver JSDoc de `AdminPort.lojistaOrderCounts` para a definição exata de cada balde. */
    lojistaOrderCounts(
      estabelecimentoId: string,
      options?: AsyncCallOptions,
    ): Promise<{ entregues: number; cancelados: number; noShow: number }> {
      return simulateAsync(
        () => {
          const pedidosDoLojista = db.pedidos.filter((p) => p.estabelecimento_id === estabelecimentoId);
          return {
            entregues: pedidosDoLojista.filter((p) => p.status === 'entregue').length,
            cancelados: pedidosDoLojista.filter((p) => CANCELADO_PEDIDO_STATUSES.has(p.status)).length,
            noShow: pedidosDoLojista.filter((p) => NO_SHOW_PEDIDO_STATUSES.has(p.status)).length,
          };
        },
        { entregues: 0, cancelados: 0, noShow: 0 },
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

          // [AUTO-DECISION] Story 8.7 (SHOULD) — contagens/taxa de sucesso
          // filtradas por `criado_em` (não `entregue_em`, ao contrário de
          // GMV/receita acima): "pedidos totais" precisa incluir os que
          // NUNCA chegaram a `entregue` (cancelados/no-show), então filtrar
          // por `entregue_em` os excluiria silenciosamente.
          const pedidosNoPeriodoPorCriacao = db.pedidos.filter((p) => new Date(p.criado_em) >= limite);
          const pedidosEntreguesNoPeriodoPorCriacao = pedidosNoPeriodoPorCriacao.filter(
            (p) => p.status === 'entregue',
          ).length;
          const pedidosCanceladosNoPeriodo = pedidosNoPeriodoPorCriacao.filter((p) =>
            CANCELADO_PEDIDO_STATUSES.has(p.status),
          ).length;
          const pedidosNoShowNoPeriodo = pedidosNoPeriodoPorCriacao.filter((p) =>
            NO_SHOW_PEDIDO_STATUSES.has(p.status),
          ).length;
          const denominadorSucesso = pedidosEntreguesNoPeriodoPorCriacao + pedidosCanceladosNoPeriodo + pedidosNoShowNoPeriodo;
          const taxaSucessoPercent =
            denominadorSucesso === 0
              ? 0
              : Math.round((pedidosEntreguesNoPeriodoPorCriacao / denominadorSucesso) * 1000) / 10;

          return {
            periodoDias,
            gmvReais,
            receitaKeepitReais,
            ranking,
            pedidosTotais: pedidosNoPeriodoPorCriacao.length,
            pedidosEntregues: pedidosEntreguesNoPeriodoPorCriacao,
            pedidosCancelados: pedidosCanceladosNoPeriodo,
            pedidosNoShow: pedidosNoShowNoPeriodo,
            taxaSucessoPercent,
          };
        },
        {
          periodoDias,
          gmvReais: 0,
          receitaKeepitReais: 0,
          ranking: [],
          pedidosTotais: 0,
          pedidosEntregues: 0,
          pedidosCancelados: 0,
          pedidosNoShow: 0,
          taxaSucessoPercent: 0,
        },
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
