import type {
  AuthPort,
  Cliente,
  ClienteConfirmacaoTelefone,
  SignUpInput,
  UpdateEmailResult,
  UpdateProfileInput,
} from '../ports/auth.port';
import type { AsyncCallOptions } from '../types';
import { generateMockId, simulateAsync } from './async-helpers';
import type { MockDb } from './db';

export function createAuthMock(db: MockDb): AuthPort {
  /**
   * Story 2.3.1 (Task 2, AC1): pub/sub mínimo fechado sobre `db`, sem
   * dependência nova (`Set` nativo). Notificado pelos 3 pontos que já mutam
   * `db.sessionClienteId` (`signUp`, `signIn`, `signOut`) logo abaixo.
   */
  const listeners = new Set<(cliente: Cliente | null) => void>();
  /** Story 2.7 — só controla se `updatePassword` aceita a chamada; nunca persiste token/senha. */
  let passwordRecoverySessionActive = false;

  function currentSessionCliente(): Cliente | null {
    return db.clientes.find((c) => c.id === db.sessionClienteId) ?? null;
  }

  function notifyAuthStateChange(): void {
    const cliente = currentSessionCliente();
    listeners.forEach((listener) => listener(cliente));
  }

  return {
    signUp(input: SignUpInput, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        () => {
          const cliente: Cliente = {
            id: generateMockId('cliente'),
            nome: input.nome,
            telefone: input.telefone,
            cpf: null,
            bloqueado: false,
            motivo_bloqueio: null,
            criado_em: new Date().toISOString(),
          };
          db.clientes.push(cliente);
          db.clienteCredenciais.push({ clienteId: cliente.id, email: input.email });
          db.sessionClienteId = cliente.id;
          notifyAuthStateChange();
          return cliente;
        },
        {} as Cliente,
        options,
      );
    },

    signIn(email: string, _senha: string, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        () => {
          const credencial = db.clienteCredenciais.find((c) => c.email === email);
          const cliente = credencial ? db.clientes.find((c) => c.id === credencial.clienteId) : undefined;
          if (!cliente) {
            throw new Error(`[mock] Cliente não encontrado para e-mail ${email}`);
          }
          if (cliente.bloqueado) {
            throw new Error(`[mock] Cliente bloqueado: ${cliente.motivo_bloqueio ?? 'sem motivo informado'}`);
          }
          db.sessionClienteId = cliente.id;
          notifyAuthStateChange();
          return cliente;
        },
        {} as Cliente,
        options,
      );
    },

    /**
     * Story 2.7 (AC6) — não chama serviço externo, não altera
     * `db.clientes`/`db.clienteCredenciais`. Resolve sempre com sucesso,
     * independente do e-mail existir (mesma anti-enumeração do adapter
     * Supabase, AC7).
     */
    requestPasswordReset(_email: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAsync(() => undefined, undefined, options);
    },

    /** Story 2.7 (AC6) — não lê a URL; só habilita `updatePassword` no mock. */
    establishPasswordRecoverySession(_callbackUrl: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAsync(
        () => {
          passwordRecoverySessionActive = true;
        },
        undefined,
        options,
      );
    },

    /** Story 2.7 (AC6) — exige `establishPasswordRecoverySession` prévio; não grava a senha em `db`. */
    updatePassword(_password: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAsync(
        () => {
          if (!passwordRecoverySessionActive) {
            throw new Error('[mock] Nenhuma sessão de recuperação ativa.');
          }
          passwordRecoverySessionActive = false;
        },
        undefined,
        options,
      );
    },

    currentUser(options?: AsyncCallOptions): Promise<Cliente | null> {
      return simulateAsync(
        () => db.clientes.find((c) => c.id === db.sessionClienteId) ?? null,
        null,
        options,
      );
    },

    signOut(options?: AsyncCallOptions): Promise<void> {
      return simulateAsync(
        () => {
          db.sessionClienteId = null;
          notifyAuthStateChange();
        },
        undefined,
        options,
      );
    },

    /** Story 2.8 (AC1, AC2) — lê `clienteCredenciais` pela sessão mock atual; `null` sem sessão. */
    currentEmail(options?: AsyncCallOptions): Promise<string | null> {
      return simulateAsync(
        () => db.clienteCredenciais.find((c) => c.clienteId === db.sessionClienteId)?.email ?? null,
        null,
        options,
      );
    },

    /**
     * Story 2.8 (AC3, AC4, AC6) — mesma barreira de autorização do adapter
     * Supabase: só a sessão mock atual pode se atualizar, `clienteId` de
     * outra sessão é rejeitado (não é a RLS real, mas o mesmo contrato).
     */
    updateProfile(clienteId: string, input: UpdateProfileInput, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        () => {
          if (db.sessionClienteId !== clienteId) {
            throw new Error('[mock] updateProfile — clienteId não corresponde à sessão autenticada.');
          }
          const cliente = db.clientes.find((c) => c.id === clienteId);
          if (!cliente) {
            throw new Error(`[mock] Cliente não encontrado: ${clienteId}`);
          }
          if (input.nome !== undefined) {
            const nome = input.nome.trim();
            if (!nome) {
              throw new Error('[mock] updateProfile — nome não pode ser vazio.');
            }
            cliente.nome = nome;
          }
          if (input.telefone !== undefined) {
            cliente.telefone = input.telefone?.trim() || null;
          }
          return cliente;
        },
        {} as Cliente,
        options,
      );
    },

    /**
     * Story 2.8 (AC5) — parity mock: sem double opt-in real (não há
     * Supabase Auth aqui), atualiza `clienteCredenciais` de imediato e
     * devolve `updated`. Documentado como desvio consciente no Dev Agent
     * Record — a UI trata os dois status genericamente, então o mock não
     * precisa simular o estado `confirmation_required`.
     */
    updateEmail(newEmail: string, options?: AsyncCallOptions): Promise<UpdateEmailResult> {
      return simulateAsync(
        () => {
          if (!db.sessionClienteId) {
            throw new Error('[mock] updateEmail — nenhuma sessão ativa.');
          }
          const email = newEmail.trim();
          if (!email) {
            throw new Error('[mock] updateEmail — e-mail inválido.');
          }
          const credencial = db.clienteCredenciais.find((c) => c.clienteId === db.sessionClienteId);
          if (credencial) {
            credencial.email = email;
          } else {
            db.clienteCredenciais.push({ clienteId: db.sessionClienteId, email });
          }
          return { status: 'updated' as const };
        },
        { status: 'updated' as const },
        options,
      );
    },

    confirmPhone(clienteId: string, codigo: string, options?: AsyncCallOptions): Promise<ClienteConfirmacaoTelefone> {
      return simulateAsync(
        () => {
          const cliente = db.clientes.find((c) => c.id === clienteId);
          if (!cliente) {
            throw new Error(`[mock] Cliente não encontrado: ${clienteId}`);
          }
          if (!/^\d{4}$/.test(codigo)) {
            throw new Error('[mock] Código de confirmação inválido — esperado 4 dígitos');
          }
          // Story 2.3: `telefone_confirmado` não existe mais em `Cliente`
          // (decisão 10.4, telefone não é verificado no MVP) — este método
          // segue existente só por contrato (`ConfirmacaoSMS.tsx` é stub
          // inativo, fora do fluxo desde a decisão 10.4; não reativado).
          const confirmacao: ClienteConfirmacaoTelefone = {
            id: generateMockId('confirmacao'),
            cliente_id: clienteId,
            telefone: cliente.telefone ?? '',
            tentativas: 1,
            expira_em: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            consumido_em: new Date().toISOString(),
          };
          return confirmacao;
        },
        {} as ClienteConfirmacaoTelefone,
        options,
      );
    },

    getById(clienteId: string, options?: AsyncCallOptions): Promise<Cliente | null> {
      return simulateAsync(() => db.clientes.find((c) => c.id === clienteId) ?? null, null, options);
    },

    updateCpf(clienteId: string, cpf: string, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        () => {
          const cliente = db.clientes.find((c) => c.id === clienteId);
          if (!cliente) {
            throw new Error(`[mock] Cliente não encontrado: ${clienteId}`);
          }
          cliente.cpf = cpf;
          return cliente;
        },
        {} as Cliente,
        options,
      );
    },

    onAuthStateChange(callback: (cliente: Cliente | null) => void): () => void {
      listeners.add(callback);
      // "Pelo menos uma vez, de forma assíncrona" (AC1) — via `simulateAsync`
      // com `delayMs: 0`, mesmo padrão de latência genuína usado no resto do
      // arquivo (nunca `Promise.resolve()` puro).
      simulateAsync(() => currentSessionCliente(), null, { delayMs: 0 }).then((cliente) => {
        if (listeners.has(callback)) {
          callback(cliente);
        }
      });
      return () => {
        listeners.delete(callback);
      };
    },
  };
}
