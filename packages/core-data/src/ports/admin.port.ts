import type { AsyncCallOptions } from '../types';
import type { Cliente } from './auth.port';
import type { Estabelecimento } from './store.port';
import type { FormaPagamento, Pedido, PedidoStatus } from './order.port';
import type { Hub, HubHorario } from './hub.port';
/** [IDS] REUSE — mesmo tipo já fixado por `EstabelecimentoCadastroPort` (Story 3.5) para `chave_pix_tipo`. */
import type { ChavePixTipoCadastro } from './estabelecimento-cadastro.port';
/**
 * [IDS] REUSE (Story 8.9) — `Saque`/`SaqueStatus` já modelam EXATAMENTE a
 * forma de um lançamento `tipo='payout'` do ponto de vista do lojista
 * (`WalletPort.statement`, Bloco 08). A fila administrativa de saques (8.9)
 * é a MESMA entidade vista pelo admin (todos os estabelecimentos, filtrado
 * por `status='pendente'`) — reaproveitar o tipo evita duplicar um
 * `PayoutPendente` quase idêntico (mesmo raciocínio já registrado no JSDoc
 * de `ReembolsoPendente`/`refundQueue`, que reconcilia o ledger único).
 */
import type { Saque } from './wallet.port';

/**
 * 9 valores exatos do CHECK constraint de `reembolsos_pendentes.motivo`.
 * [Source: docs/architecture/03-data-models.md#6.1]
 */
export type ReembolsoMotivo =
  | 'timeout_aceite'
  | 'recusa_lojista'
  | 'cancelamento_cliente_pre_aceite'
  | 'cancelamento_cliente_pos_aceite'
  | 'cancelamento_atraso'
  | 'nao_retirado_cliente'
  | 'nao_entregue_lojista'
  | 'chargeback'
  | 'cancelamento_admin';

export type ReembolsoStatus = 'pendente_admin' | 'em_processamento' | 'estornado' | 'erro';

/**
 * Resultado que o admin registra ao confirmar manualmente um lançamento
 * pendente (reembolso OU saque) — Stories 8.2/8.9, RPC compartilhada
 * `confirmar_lancamento_admin`. `em_processamento`/`pendente_admin` NUNCA são
 * produzidos por esta chamada (são estados de leitura/otimismo client-side —
 * ver Story 8.1 Dependencies item 1); só o DESFECHO (sucesso ou falha) é
 * escrito.
 */
export type LancamentoConfirmResultado = 'concluido' | 'erro';

/**
 * Domínio: tabela `reembolsos_pendentes`.
 * [Source: docs/architecture/03-data-models.md#6.1]
 */
export interface ReembolsoPendente {
  id: string;
  pedido_id: string;
  motivo: ReembolsoMotivo;
  valor_a_estornar_reais: number;
  valor_ao_lojista_reais: number;
  forma_pagamento: FormaPagamento;
  status: ReembolsoStatus;
  criado_em: string;
}

/**
 * 4 valores exatos do CHECK constraint de `estabelecimentos_falhas.tipo`.
 * [Source: docs/architecture/03-data-models.md#1.6]
 */
export type EstabelecimentoFalhaTipo = 'lojista_nao_apareceu' | 'atraso_grave' | 'chargeback' | 'reclamacao_admin';

/**
 * Domínio: tabela `estabelecimentos_falhas` — promovido de
 * `apps/admin/src/mock/adminOpsTypes.ts` (Story 0.13, Task 9) para
 * `packages/core-data` (Story 1.10, Task 4).
 * [Source: docs/architecture/03-data-models.md#1.6]
 */
export interface EstabelecimentoFalha {
  id: string;
  estabelecimento_id: string;
  pedido_id: string | null;
  tipo: EstabelecimentoFalhaTipo;
  detalhes: string;
  criado_em: string;
}

export interface FinancialRankingEntry {
  estabelecimento_id: string;
  nome_fantasia: string;
  gmvReais: number;
  pedidosEntregues: number;
}

export interface FinancialDashboardResult {
  periodoDias: number;
  gmvReais: number;
  receitaKeepitReais: number;
  ranking: FinancialRankingEntry[];
  /**
   * [AUTO-DECISION] Story 8.7 — @po marcou contagens + taxa de sucesso como
   * SHOULD (agregação barata sobre a MESMA leitura de `pedidos` do período,
   * central à "visão executiva" do AC1). Contadas por `criado_em` dentro do
   * período (não `entregue_em`, ao contrário de `gmvReais`/`receitaKeepitReais`
   * — "pedidos totais" inclui os que NUNCA chegaram a `entregue`). Ranking de
   * hubs e gráfico de linha (Recharts) ficam como débito não-bloqueante
   * (decisão de @po registrada na Story 8.7), não implementados aqui.
   */
  pedidosTotais: number;
  pedidosEntregues: number;
  pedidosCancelados: number;
  pedidosNoShow: number;
  /**
   * `pedidosEntregues / (pedidosEntregues + pedidosCancelados + pedidosNoShow)`,
   * em percentual (0-100), arredondado a 1 casa. `0` honesto quando o
   * denominador é zero (nenhum pedido concluído/cancelado/no-show no
   * período) — nunca `NaN`/`Infinity` vazando para a UI.
   */
  taxaSucessoPercent: number;
}

/** Extensões aceitas pelo bucket PÚBLICO `hubs` (`allowed_mime_types`, migration `20260812164200`). */
export type HubFotoExt = 'jpg' | 'jpeg' | 'png' | 'webp';

/**
 * Story 4.1 (AC2, AC6) — [IDS] ADAPT do padrão `FachadaUploadInput`
 * (`EstabelecimentoCadastroPort`, Story 3.5): mesmo formato `{ uri, ext }` e
 * mesma implementação (`fetch(uri).blob()`), reaproveitado tal como está —
 * `fetch()` resolve tanto URIs de arquivo local (RN) quanto Blob URLs de
 * browser (`URL.createObjectURL(file)`, usado pelo Admin web nesta Story,
 * que não tem `expo-image-picker` nem qualquer mecanismo de upload nativo
 * — é Next.js). Nenhuma port nova criada só para essa diferença de origem.
 */
export interface HubFotoUploadInput {
  uri: string;
  ext: HubFotoExt;
}

export interface CreateHubInput {
  nome: string;
  endereco: string;
  lat: number;
  lng: number;
  ponto_referencia?: string | null;
  foto_url?: string | null;
  horarios: HubHorario[];
}

export interface UpdateHubInput {
  nome?: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  ponto_referencia?: string | null;
  foto_url?: string | null;
  ativo?: boolean;
  horarios?: HubHorario[];
}

/**
 * `Estabelecimento` + colunas restritas ao papel Admin — Story 3.7 (AC2, AC3).
 *
 * [IDS] CREATE. [AUTO-DECISION] Tipo administrativo dedicado, NÃO extensão
 * direta de `StorePort.Estabelecimento` → (reason: `Estabelecimento` é o
 * tipo de domínio da Descoberta, consumido também por `apps/cliente`
 * (`useStoreDetail`) — alargá-lo com `cnpj`/`telefone`/`responsavel_nome`/
 * `dados_receita` vazaria dado sensível/administrativo para um tipo que hoje
 * só circula em telas do Cliente. Mesmo raciocínio já registrado no JSDoc de
 * `EstabelecimentoCadastroPort` (Story 3.5) para não produzir um
 * "Estabelecimento de descoberta fantasma".
 *
 * [AUTO-DECISION] `Omit<Estabelecimento, 'lat' | 'lng' | 'raio_atendimento_km'> & {...}`
 * em vez de `extends Estabelecimento` → (reason: o schema físico de
 * `estabelecimentos` (`docs/architecture/03-data-models.md#1.4`, confirmado
 * por sonda real via REST) tem `lat`/`lng`/`raio_atendimento_km` NULLABLE
 * (geo/raio adiados — Story 3.4 é `SIMPLE`), mas `StorePort.Estabelecimento`
 * os declara `number` não-nulo (presunção da Descoberta do Cliente, fora do
 * piloto). `extends` não permite alargar um campo de `number` para
 * `number | null` numa subinterface — `Omit<> & {...}` resolve isso sem
 * tocar o tipo base nem inventar um fallback numérico para um dado ausente).
 */
export interface EstabelecimentoAdmin extends Omit<Estabelecimento, 'lat' | 'lng' | 'raio_atendimento_km'> {
  lat: number | null;
  lng: number | null;
  raio_atendimento_km: number | null;
  cnpj: string;
  telefone: string;
  responsavel_nome: string;
  chave_pix: string;
  chave_pix_tipo: ChavePixTipoCadastro;
  /**
   * Sempre `null` no piloto (Story 3.3 é `SIMPLE` — BrasilAPI não preenche
   * este campo). AC3: a UI exibe "não coletado" quando `null`, nunca um dado
   * inventado ou placeholder que pareça real.
   */
  dados_receita: Record<string, unknown> | null;
  criado_em: string;
  aprovado_em: string | null;
  aprovado_por: string | null;
  /**
   * URL assinada de curta expiração do bucket privado `fachadas`
   * (`docs/architecture/05-security.md §6.7`) — só populada por
   * `pendingStoreDetail` (AC3). `pendingStores` (lista, AC2) não gera URL
   * assinada por item (evitaria N chamadas de Storage só para uma lista que
   * nem exibe foto) — `undefined` nesse caso. `null` quando o
   * estabelecimento não tem `foto_fachada_url` cadastrado.
   */
  foto_fachada_url_assinada?: string | null;
}

export interface AdminPort {
  /** Lojas com `status = 'em_analise'`, aguardando aprovação/rejeição — Story 3.7 (AC2). */
  pendingStores(options?: AsyncCallOptions): Promise<EstabelecimentoAdmin[]>;
  /**
   * Detalhe administrativo completo de um estabelecimento (AC3) — os dados
   * dos 3 passos do cadastro + foto de fachada via URL assinada +
   * `dados_receita`. `null` quando o `id` não existe. Deliberadamente
   * distinto de `StorePort.getById` (ver JSDoc de `EstabelecimentoAdmin`).
   */
  pendingStoreDetail(id: string, options?: AsyncCallOptions): Promise<EstabelecimentoAdmin | null>;
  approve(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Estabelecimento>;
  reject(estabelecimentoId: string, motivo: string, options?: AsyncCallOptions): Promise<Estabelecimento>;
  hubsCrud: {
    /**
     * [AUTO-DECISION] Story 4.1 (Dependencies, decisão de escopo #1) —
     * método administrativo dedicado (paralelo a `listAllEstabelecimentos`
     * abaixo), NÃO reuso de `HubPort.listNearby` → (reason:
     * `HubPort.listNearby` é a leitura pública de Descoberta — Épico 5 — e
     * filtra `ativo = true` por design (o cliente nunca deve ver um hub
     * desativado). O Admin precisa enxergar E REATIVAR hubs inativos (AC1);
     * misturar essa necessidade em `HubPort` acoplaria a port de Descoberta
     * a uma preocupação puramente administrativa. Mesmo raciocínio já
     * registrado para `listAllEstabelecimentos` vs. `StorePort.listByHub`.
     * Resolvida aqui, na ausência de uma sessão dedicada de @architect —
     * documentado como a decisão que a própria Story delegou.
     */
    list(options?: AsyncCallOptions): Promise<Hub[]>;
    /** Paralelo a `list` — usado por `/hubs/[id]` para religar a edição a um hub que pode estar inativo (mesmo motivo de `list`). */
    getById(id: string, options?: AsyncCallOptions): Promise<Hub | null>;
    create(input: CreateHubInput, options?: AsyncCallOptions): Promise<Hub>;
    update(id: string, input: UpdateHubInput, options?: AsyncCallOptions): Promise<Hub>;
    delete(id: string, options?: AsyncCallOptions): Promise<void>;
    /**
     * Upload da foto institucional do hub (AC2, AC6) — bucket PÚBLICO `hubs`
     * (`docs/architecture/05-security.md §6.7`), diferente do bucket
     * privado `fachadas`. Retorna a URL PÚBLICA direta do objeto (nunca uma
     * URL assinada) — `Hub.foto_url` persiste essa URL tal como recebida,
     * sem re-derivação no momento da leitura (o bucket público não expira,
     * ao contrário do padrão de `fachadas`/`uploadFachada`, que persiste um
     * path e assina sob demanda).
     */
    uploadFoto(input: HubFotoUploadInput, options?: AsyncCallOptions): Promise<string>;
  };
  refundQueue: {
    list(options?: AsyncCallOptions): Promise<ReembolsoPendente[]>;
    /**
     * [AUTO-DECISION] Story 8.2 (AC2) — assinatura estendida com `resultado`/
     * `detalhe` (não existia no esqueleto original, que só marcava sucesso).
     * A RPC real (`confirmar_lancamento_admin`) exige o desfecho explícito —
     * sem isso não há como o admin registrar uma falha auditável (AC2: "marca
     * 'concluido' OU 'erro' com detalhe"). `detalhe` é a nota livre (motivo do
     * erro/referência do PIX manual) — opcional em ambos os resultados.
     */
    process(
      id: string,
      resultado: LancamentoConfirmResultado,
      detalhe?: string,
      options?: AsyncCallOptions,
    ): Promise<ReembolsoPendente>;
  };

  /**
   * Story 8.9 — fila administrativa de saques (`lancamentos_financeiros
   * WHERE tipo='payout' AND status='pendente'`), mesmo padrão estrutural de
   * `refundQueue` (IDS: ADAPT do precedente 8.1/8.2). Reaproveita `Saque`/
   * `SaqueStatus` (`WalletPort`) em vez de um tipo `PayoutPendente` novo —
   * mesma entidade, ângulo administrativo (todos os estabelecimentos) em vez
   * do ângulo do lojista (um `estabelecimento_id`).
   */
  payoutQueue: {
    list(options?: AsyncCallOptions): Promise<Saque[]>;
    process(
      id: string,
      resultado: LancamentoConfirmResultado,
      detalhe?: string,
      options?: AsyncCallOptions,
    ): Promise<Saque>;
  };

  // ---------------------------------------------------------------------
  // Admin-ops (Story 1.10, Task 4 — promovido de
  // `apps/admin/src/mock/adminOpsMock.ts`, Story 0.13)
  // ---------------------------------------------------------------------

  /** Busca por nome/telefone — `AuthPort.currentUser()` só resolve a sessão atual, não lista todos os clientes. */
  listClientes(filtros?: { busca?: string }, options?: AsyncCallOptions): Promise<Cliente[]>;
  blockCliente(clienteId: string, motivo: string, options?: AsyncCallOptions): Promise<Cliente>;
  unblockCliente(clienteId: string, options?: AsyncCallOptions): Promise<Cliente>;
  /**
   * [AUTO-DECISION] `listAllEstabelecimentos` não estava listado no texto
   * literal do AC4, mas é necessário para as telas do Admin (lista de
   * pedidos/qualidade do lojista precisam resolver nome da loja e listar
   * todos os lojistas, independente de status) — `StorePort.listByHub` só
   * retorna lojas `ativo`. Adicionado aqui (não em `StorePort`) porque é uma
   * capacidade administrativa (ver todas, inclusive suspensas/em análise),
   * não uma capacidade de catálogo do Cliente/Lojista.
   */
  listAllEstabelecimentos(options?: AsyncCallOptions): Promise<Estabelecimento[]>;
  suspendLojista(estabelecimentoId: string, motivo: string, options?: AsyncCallOptions): Promise<Estabelecimento>;
  /**
   * [IDS] CREATE (Story 8.6) — capacidade genuinamente nova, ausente da port
   * até esta Story (confirmado por busca no código-fonte: nenhuma UI/mock
   * prévios). Par de `suspendLojista`: reverte `status: 'suspenso' →
   * 'ativo'`. Guarda de estado simétrica (só reativa quem está `suspenso` —
   * nunca promove `em_analise`/`rejeitado` pulando `approve`).
   */
  reactivateLojista(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Estabelecimento>;
  lojistaQualityView(estabelecimentoId: string, options?: AsyncCallOptions): Promise<EstabelecimentoFalha[]>;
  /**
   * [AUTO-DECISION] Story 8.8 (AC1) — método NOVO, separado de
   * `lojistaQualityView` (em vez de alargar o retorno de `EstabelecimentoFalha[]`
   * para um objeto composto) → (reason: preserva o tipo de retorno já
   * consumido pela UI existente, evita uma mudança de forma disruptiva num
   * método já implementado; `@po` marcou as contagens como CORE mas não
   * prescreveu a forma exata — este é o "método adicional" citado como
   * alternativa nas Tasks da Story). Contagem sobre `pedidos` do lojista:
   * `entregues` = `status='entregue'`; `cancelados` = qualquer status
   * `cancelado*`/`recusado`/`estornado_chargeback`; `noShow` =
   * `nao_retirado`/`nao_entregue_lojista` (lojista não apareceu). Nenhum
   * filtro de período — contagem histórica total (mesmo espírito do texto do
   * Épico, "decidir quando suspender" olha o histórico completo, não uma
   * janela).
   */
  lojistaOrderCounts(
    estabelecimentoId: string,
    options?: AsyncCallOptions,
  ): Promise<{ entregues: number; cancelados: number; noShow: number }>;
  /**
   * GMV/receita Keepit/ranking por loja no período — deriva 100% de
   * `pedidos.total_pago_reais`/`taxa_keepit_reais` de pedidos `entregue`,
   * nunca hardcoded.
   */
  financialDashboard(periodoDias: number, options?: AsyncCallOptions): Promise<FinancialDashboardResult>;
  /** Listagem administrativa de pedidos (todos os estabelecimentos), com filtro opcional de status. */
  listAllOrders(filtros?: { status?: PedidoStatus }, options?: AsyncCallOptions): Promise<Pedido[]>;
  /** Força `status -> cancelado_admin` e popula `reembolsos` (`motivo: 'cancelamento_admin'`, 100% cliente). */
  forceCancelOrder(pedidoId: string, motivo: string, options?: AsyncCallOptions): Promise<Pedido>;
}
