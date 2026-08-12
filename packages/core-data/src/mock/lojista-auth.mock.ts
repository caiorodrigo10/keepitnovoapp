import type {
  LojistaAuthPort,
  LojistaCadastroMetadata,
  LojistaConta,
  LojistaSignUpInput,
} from '../ports/lojista-auth.port';
import type { AsyncCallOptions } from '../types';
import { EmailJaExisteError } from '../supabase/auth-errors';
import { generateMockId, simulateAsync } from './async-helpers';
import type { MockDb } from './db';

/**
 * Mock de `LojistaAuthPort` — Story 3.2 (AC4, AC7, `signUp`), estendido pela
 * Story 3.10 (AC1, AC4, AC6 — `signIn`/`signOut`/`getCadastroMetadata`).
 *
 * Paridade funcional com `createAuthMock` (Cliente)/`adminAuth.ts`
 * (Admin): mesma latência genuína via `simulateAsync`, mesmo tipo de erro de
 * duplicidade (`EmailJaExisteError`), e a MESMA permissividade de senha (o
 * mock nunca valida `senha` — só a existência de uma conta com o e-mail
 * informado, igual a `auth.mock.ts#signIn`/`adminAuth.ts#mockSignIn`).
 *
 * [AUTO-DECISION] (Story 3.10, AC1) `signIn` SEM o antigo comportamento
 * "qualquer entrada sempre entra" de `lojistaSession.ts#signInLojista()` →
 * (reason: essa Story existe justamente para que o roteamento pós-login
 * dependa do estado REAL do estabelecimento (AC2-AC6) — um login que sempre
 * sucede sem identidade nenhuma não teria contra o que ler esse estado, e
 * seria a própria "heurística local decidindo a rota" que o AC6 proíbe. O
 * mock continua "permissivo" no único sentido que os mocks irmãos (Cliente,
 * Admin) já usam essa palavra: a SENHA não é validada. E-mail sem
 * `signUp` prévio nesta sessão do mock (nenhuma fixture pré-semeada, mesmo
 * "piloto sempre começa vazio" documentado em `db.lojistaContas`) é uma
 * falha honesta, igual à de `auth.mock.ts#signIn` para um `Cliente`
 * desconhecido).
 */
export function createLojistaAuthMock(db: MockDb): LojistaAuthPort {
  function contaAtual() {
    return db.lojistaContas.find((conta) => conta.id === db.sessionLojistaUserId);
  }

  return {
    signUp(input: LojistaSignUpInput, options?: AsyncCallOptions): Promise<LojistaConta> {
      return simulateAsync(
        () => {
          const email = input.email.trim();
          if (db.lojistaContas.some((conta) => conta.email === email)) {
            throw new EmailJaExisteError(email);
          }
          const conta: LojistaConta = {
            id: generateMockId('lojista'),
            email,
            criado_em: new Date().toISOString(),
          };
          db.lojistaContas.push({
            ...conta,
            nome_fantasia: input.nome_fantasia.trim(),
            cnpj: input.cnpj,
            telefone: input.telefone,
            responsavel_nome: input.responsavel_nome.trim(),
          });
          db.sessionLojistaUserId = conta.id;
          return conta;
        },
        {} as LojistaConta,
        options,
      );
    },

    signIn(email: string, _senha: string, options?: AsyncCallOptions): Promise<LojistaConta> {
      return simulateAsync(
        () => {
          const conta = db.lojistaContas.find((c) => c.email === email.trim());
          if (!conta) {
            throw new Error(`[mock] Lojista não encontrado para e-mail ${email}`);
          }
          db.sessionLojistaUserId = conta.id;
          return { id: conta.id, email: conta.email, criado_em: conta.criado_em };
        },
        {} as LojistaConta,
        options,
      );
    },

    signOut(options?: AsyncCallOptions): Promise<void> {
      return simulateAsync(
        () => {
          db.sessionLojistaUserId = null;
        },
        undefined,
        options,
      );
    },

    getCadastroMetadata(options?: AsyncCallOptions): Promise<LojistaCadastroMetadata | null> {
      return simulateAsync(
        () => {
          const conta = contaAtual();
          if (!conta) {
            return null;
          }
          return {
            nome_fantasia: conta.nome_fantasia,
            cnpj: conta.cnpj,
            telefone: conta.telefone,
            responsavel_nome: conta.responsavel_nome,
          };
        },
        null,
        options,
      );
    },
  };
}
