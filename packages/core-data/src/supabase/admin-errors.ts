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

type AdminLojistaRpc = 'aprovar_lojista' | 'rejeitar_lojista';

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

/** RPC: `ESTADO_INVALIDO` — o estabelecimento existe, mas não está `em_analise`. */
export class EstadoInvalidoError extends Error {
  constructor(rpc: AdminLojistaRpc) {
    super(`[core-data] ${rpc} — estabelecimento não está em em_analise (ESTADO_INVALIDO)`);
    this.name = 'EstadoInvalidoError';
  }
}

/**
 * RPC: `MOTIVO_OBRIGATORIO` — `rejeitar_lojista` exclusivo. `p_motivo` vazio
 * (ou só espaços) após `btrim()` — validação server-side, defesa contra
 * bypass da validação client-side já existente na tela (Story 0.12).
 */
export class MotivoObrigatorioError extends Error {
  constructor() {
    super('[core-data] rejeitar_lojista — motivo de rejeição obrigatório (MOTIVO_OBRIGATORIO)');
    this.name = 'MotivoObrigatorioError';
  }
}
