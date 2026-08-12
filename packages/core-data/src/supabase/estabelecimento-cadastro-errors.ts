/**
 * Story 3.5 (AC3, AC4) — [IDS] CREATE.
 *
 * Os 4 erros nomeados que a RPC `criar_estabelecimento_completo`
 * (`apps/supabase/supabase/migrations/20260812123048_rpc_criar_estabelecimento_completo.sql`)
 * levanta via `RAISE EXCEPTION '<CODIGO>'`. `supabase-js` propaga o texto do
 * `RAISE EXCEPTION` em `error.message` (sem SQLSTATE dedicado — exceção
 * customizada de PL/pgSQL cai no genérico `P0001`) — por isso o adapter
 * Supabase (`estabelecimento-cadastro.supabase.ts`) faz `.includes()` no
 * texto, não uma comparação de `error.code`.
 *
 * Mesmo padrão de `auth-errors.ts` (`EmailJaExisteError`, Story 2.3):
 * classes de erro dedicadas, reaproveitadas TANTO pelo adapter Supabase
 * quanto pelo mock (`../mock/estabelecimento-cadastro.mock.ts`) — paridade
 * de contrato de erro entre os dois modos, exigida pela Story (AC3/AC4 não
 * distinguem "mock" de "Supabase" no texto).
 */

/** RPC: `AUTENTICACAO_NECESSARIA` — sem sessão de lojista (`auth.uid()` nulo). */
export class AutenticacaoNecessariaError extends Error {
  constructor() {
    super('[core-data] criar_estabelecimento_completo — sessão de lojista ausente (AUTENTICACAO_NECESSARIA)');
    this.name = 'AutenticacaoNecessariaError';
  }
}

/** RPC: `HORARIOS_INVALIDOS` — `p_horarios` não é um array JSON de exatamente 7 dias. */
export class HorariosInvalidosError extends Error {
  constructor() {
    super('[core-data] criar_estabelecimento_completo — horários inválidos, esperado array de 7 dias (HORARIOS_INVALIDOS)');
    this.name = 'HorariosInvalidosError';
  }
}

/**
 * RPC: `CADASTRO_JA_PROCESSADO` — já existe um estabelecimento deste
 * `dono_user_id` fora do estado `em_analise` (aprovado/rejeitado/suspenso);
 * o reenvio do Passo 3 não pode sobrescrever um cadastro já julgado (AC4).
 */
export class CadastroJaProcessadoError extends Error {
  constructor() {
    super('[core-data] criar_estabelecimento_completo — cadastro já analisado, fora de em_analise (CADASTRO_JA_PROCESSADO)');
    this.name = 'CadastroJaProcessadoError';
  }
}

/**
 * RPC: `CNPJ_DUPLICADO` — o CNPJ colide com o de OUTRO `dono_user_id`
 * (violação da constraint `UNIQUE (cnpj)`). Mensagem honesta ao lojista,
 * sem vazar qual outro estabelecimento/dono já usa o CNPJ (AC4).
 */
export class CnpjDuplicadoError extends Error {
  constructor() {
    super('[core-data] criar_estabelecimento_completo — CNPJ já cadastrado em outro estabelecimento (CNPJ_DUPLICADO)');
    this.name = 'CnpjDuplicadoError';
  }
}
