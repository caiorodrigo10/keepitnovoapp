import type { MeuEstabelecimentoStatus } from '@keepit/core-data';

/**
 * Story 3.10 (AC2-AC6) — [IDS] CREATE. Função pura que traduz o resultado
 * REAL de `estabelecimentoCadastro.getMeuEstabelecimento()` (ou `null`, caso
 * "0 linhas" — AC4) na decisão de roteamento pós-login, sem tocar
 * `navigation`/React em nenhum ponto. Extraída de `Login.tsx` para ser
 * testável isoladamente (mesmo padrão já usado em
 * `cadastroPasso2Validation.ts`/`cnpj.ts`/`telefoneMask.ts` — lógica pura em
 * `lib/`, componente só chama e reage ao resultado).
 *
 * Os 5 ramos exigidos pela Story (AC2-AC6): `em_analise` → `EmAnalise`;
 * `ativo` → `Main` (via `signInLojista()`, decidido pelo chamador —
 * `Login.tsx` — não aqui); `rejeitado` → `CadastroRejeitado`, carregando
 * `motivo_rejeicao` tal como veio (nunca truncado/inventado, AC3); `null`
 * (0 linhas) → retomada do wizard (AC4); qualquer outro `status` (hoje só
 * `suspenso`) → `ContaIndisponivel` (AC5, tratamento defensivo).
 */
export type LoginRotaDecisao =
  | { tipo: 'retomarWizard' }
  | { tipo: 'emAnalise' }
  | { tipo: 'ativo' }
  | { tipo: 'rejeitado'; motivoRejeicao: string | null }
  | { tipo: 'contaIndisponivel' };

export function resolveRotaPosLogin(meuEstabelecimento: MeuEstabelecimentoStatus | null): LoginRotaDecisao {
  if (!meuEstabelecimento) {
    return { tipo: 'retomarWizard' };
  }

  switch (meuEstabelecimento.status) {
    case 'em_analise':
      return { tipo: 'emAnalise' };
    case 'ativo':
      return { tipo: 'ativo' };
    case 'rejeitado':
      return { tipo: 'rejeitado', motivoRejeicao: meuEstabelecimento.motivo_rejeicao };
    default:
      // AC5 — `suspenso` e qualquer valor futuro não mapeado.
      return { tipo: 'contaIndisponivel' };
  }
}
