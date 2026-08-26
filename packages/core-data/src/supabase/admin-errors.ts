/**
 * Stories 3.8 (aprovar) / 3.9 (rejeitar) — [IDS] CREATE.
 *
 * Erros nomeados que as RPCs `aprovar_lojista`/`rejeitar_lojista`
 * (`apps/supabase/supabase/migrations/20260812132332_rpc_aprovar_lojista.sql`,
 * `apps/supabase/supabase/migrations/20260812132333_rpc_rejeitar_lojista.sql`)
 * levantam via `RAISE EXCEPTION '<CODIGO>'`. Mesmo padrão de
 * `estabelecimento-cadastro-errors.ts` (Story 3.5): `supabase-js` propaga o
 * texto do `RAISE EXCEPTION` em `error.message` (sem SQLSTATE dedicado — cai
 * no genérico `P0001`), então `admin.supabase.ts` faz `.includes()` no
 * texto, não uma comparação de `error.code`.
 *
 * `AutenticacaoNecessariaError`/`AcessoNegadoError`/
 * `EstabelecimentoNaoEncontradoError`/`EstadoInvalidoError` são
 * compartilhados por `aprovar_lojista` E `rejeitar_lojista` (mesmos 4 erros
 * nomeados nas duas RPCs) — o parâmetro `rpc` no construtor identifica qual
 * das duas levantou o erro, sem duplicar 4 classes para cada função.
 * `MotivoObrigatorioError` é exclusivo de `rejeitar_lojista` (AC2 da Story
 * 3.9 — motivo validado também server-side, não só client-side).
 */

type AdminLojistaRpc =
  | 'aprovar_lojista'
  | 'rejeitar_lojista'
  /** Bloco 09 (Stories 8.2/8.9) — [IDS] ADAPT: união alargada para reaproveitar as classes abaixo nas novas RPCs administrativas, mesmos 4 códigos nomeados (`AUTENTICACAO_NECESSARIA`/`ESTABELECIMENTO_NAO_ENCONTRADO`/`ESTADO_INVALIDO`), sem duplicar classe por RPC. */
  | 'confirmar_lancamento_admin'
  | 'forcar_cancelamento_pedido'
  | 'bloquear_cliente'
  | 'desbloquear_cliente'
  | 'suspender_lojista'
  | 'reativar_lojista';

/** RPC: `AUTENTICACAO_NECESSARIA` — sem sessão (`auth.uid()` nulo). */
export class AutenticacaoNecessariaError extends Error {
  constructor(rpc: AdminLojistaRpc) {
    super(`[core-data] ${rpc} — sessão de admin ausente (AUTENTICACAO_NECESSARIA)`);
    this.name = 'AutenticacaoNecessariaError';
  }
}

/** RPC: `ACESSO_NEGADO` — usuário autenticado, mas `is_admin()` falso. */
export class AcessoNegadoError extends Error {
  constructor(rpc: AdminLojistaRpc) {
    super(`[core-data] ${rpc} — usuário autenticado não é admin (ACESSO_NEGADO)`);
    this.name = 'AcessoNegadoError';
  }
}

/** RPC: `ESTABELECIMENTO_NAO_ENCONTRADO` — nenhum estabelecimento com o `p_estab_id` informado. */
export class EstabelecimentoNaoEncontradoError extends Error {
  constructor(rpc: AdminLojistaRpc) {
    super(`[core-data] ${rpc} — estabelecimento não encontrado (ESTABELECIMENTO_NAO_ENCONTRADO)`);
    this.name = 'EstabelecimentoNaoEncontradoError';
  }
}

/**
 * RPC: `ESTADO_INVALIDO` — o recurso existe, mas não está no estado exigido
 * pela operação. [AUTO-DECISION] Bloco 09 — mensagem generalizada (era
 * "estabelecimento não está em em_analise", específica de
 * `aprovar_lojista`/`rejeitar_lojista`) para cobrir honestamente os novos
 * contextos reutilizados (`confirmar_lancamento_admin` — lançamento não
 * `pendente`; `forcar_cancelamento_pedido` — pedido em estado terminal;
 * `suspender_lojista`/`reativar_lojista` — guarda `ativo`↔`suspenso`).
 */
export class EstadoInvalidoError extends Error {
  constructor(rpc: AdminLojistaRpc) {
    super(`[core-data] ${rpc} — estado inválido para esta operação (ESTADO_INVALIDO)`);
    this.name = 'EstadoInvalidoError';
  }
}

/**
 * RPC: `MOTIVO_OBRIGATORIO` — `p_motivo` vazio (ou só espaços) após
 * `btrim()` — validação server-side, defesa contra bypass da validação
 * client-side já existente na tela. [AUTO-DECISION] Bloco 09 — construtor
 * ganhou `rpc?: string` opcional (default preserva a mensagem original de
 * `rejeitar_lojista`, Story 3.9) para ser reutilizado por
 * `bloquear_cliente`/`forcar_cancelamento_pedido`/`suspender_lojista`
 * (mesmo código nomeado, motivo textual diferente por chamador).
 */
export class MotivoObrigatorioError extends Error {
  constructor(rpc = 'rejeitar_lojista') {
    super(`[core-data] ${rpc} — motivo obrigatório (MOTIVO_OBRIGATORIO)`);
    this.name = 'MotivoObrigatorioError';
  }
}

/**
 * RPC: `NAO_AUTORIZADO` — Bloco 09. Usuário autenticado, mas `is_admin()`
 * falso. [IDS] CREATE, não REUSE de `AcessoNegadoError` → (reason: as RPCs
 * de 3.8/3.9 levantam `ACESSO_NEGADO`; as 6 RPCs novas do Bloco 09 levantam
 * `NAO_AUTORIZADO` — códigos DIFERENTES levantados pelo Postgres, mesmo
 * significado semântico. Uma classe reagrupando os dois textos perderia a
 * correspondência 1:1 com o código real levantado pela RPC).
 */
export class NaoAutorizadoError extends Error {
  constructor(rpc: AdminLojistaRpc) {
    super(`[core-data] ${rpc} — usuário autenticado não é admin (NAO_AUTORIZADO)`);
    this.name = 'NaoAutorizadoError';
  }
}

/** RPC: `RESULTADO_INVALIDO` — `confirmar_lancamento_admin` exclusivo. `p_resultado` fora de `{'concluido','erro'}`. */
export class ResultadoInvalidoError extends Error {
  constructor() {
    super("[core-data] confirmar_lancamento_admin — p_resultado deve ser 'concluido' ou 'erro' (RESULTADO_INVALIDO)");
    this.name = 'ResultadoInvalidoError';
  }
}

/** RPC: `LANCAMENTO_NAO_ENCONTRADO` — `confirmar_lancamento_admin` exclusivo. Nenhum lançamento com o id informado. */
export class LancamentoNaoEncontradoError extends Error {
  constructor() {
    super('[core-data] confirmar_lancamento_admin — lançamento não encontrado (LANCAMENTO_NAO_ENCONTRADO)');
    this.name = 'LancamentoNaoEncontradoError';
  }
}

/** RPC: `TIPO_INVALIDO` — `confirmar_lancamento_admin` exclusivo. Lançamento não é `refund` nem `payout` (ex.: `charge`/`platform_fee`/`merchant_credit`). */
export class TipoInvalidoError extends Error {
  constructor() {
    super(
      '[core-data] confirmar_lancamento_admin — só lançamentos refund ou payout podem ser confirmados (TIPO_INVALIDO)',
    );
    this.name = 'TipoInvalidoError';
  }
}

/**
 * RPC: `PEDIDO_NAO_ENCONTRADO` — `forcar_cancelamento_pedido` exclusivo.
 * [IDS] CREATE nesta port (não REUSE do `PedidoNaoEncontradoError` de
 * `order-errors.ts`) → (reason: classes escopadas por arquivo/adapter, mesmo
 * padrão já usado por `AutenticacaoNecessariaError`/`ClienteNaoEncontradoError`
 * existindo em múltiplos arquivos de erros do repo — `admin.supabase.ts`
 * importa só deste arquivo, sem acoplar aos erros de `order.supabase.ts`).
 */
export class PedidoNaoEncontradoError extends Error {
  constructor() {
    super('[core-data] forcar_cancelamento_pedido — pedido não encontrado (PEDIDO_NAO_ENCONTRADO)');
    this.name = 'PedidoNaoEncontradoError';
  }
}

/** RPC: `CLIENTE_NAO_ENCONTRADO` — `bloquear_cliente`/`desbloquear_cliente`. Nenhum cliente com o id informado. */
export class ClienteNaoEncontradoError extends Error {
  constructor(rpc: 'bloquear_cliente' | 'desbloquear_cliente') {
    super(`[core-data] ${rpc} — cliente não encontrado (CLIENTE_NAO_ENCONTRADO)`);
    this.name = 'ClienteNaoEncontradoError';
  }
}
