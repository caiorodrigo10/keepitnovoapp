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
import { CLIENTE_DEMO_INITIAL_PASSWORD } from './cliente-state';
import type { MockDb } from './db';

const PASSWORD_RECOVERY_CALLBACK = 'com.keepithub.cliente://auth/reset';

export function createAuthMock(db: MockDb): AuthPort {
  /**
   * Story 2.3.1 (Task 2, AC1): pub/sub mínimo fechado sobre `db`, sem
   * dependência nova (`Set` nativo). Notificado pelos 3 pontos que já mutam
   * `db.sessionClienteId` (`signUp`, `signIn`, `signOut`) logo abaixo.
   */
  const listeners = new Set<(cliente: Cliente | null) => void>();
  /** Story 2.7 — separa a conta solicitada da sessão de recuperação mock ativa. */
  let requestedPasswordRecoveryClienteId: string | null = null;
  let passwordRecoveryClienteId: string | null = null;

  function currentSessionCliente(): Cliente | null {
    return db.clientes.find((c) => c.id === db.sessionClienteId) ?? null;
  }

  function notifyAuthStateChange(): void {
    const cliente = currentSessionCliente();
    listeners.forEach((listener) => listener(cliente));
  }

  function assertPasswordRecoveryCallback(callbackUrl: string): void {
    let url: URL;
    try {
      url = new URL(callbackUrl);
    } catch {
      throw new Error('[mock] auth.establishPasswordRecoverySession — callback inválido.');
    }

    if (`${url.protocol}//${url.host}${url.pathname}` !== PASSWORD_RECOVERY_CALLBACK) {
      throw new Error('[mock] auth.establishPasswordRecoverySession — callback de outra rota.');
    }

    const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
    if (url.searchParams.has('error') || hash.has('error')) {
      throw new Error('[mock] auth.establishPasswordRecoverySession — link inválido ou expirado.');
    }
  }

  db.onClienteStateReset = () => {
    requestedPasswordRecoveryClienteId = null;
    passwordRecoveryClienteId = null;
    notifyAuthStateChange();
  };

  return {
    signUp(input: SignUpInput, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        async () => {
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
          db.clienteCredenciais.push({ clienteId: cliente.id, email: input.email, password: input.senha });
          db.sessionClienteId = cliente.id;
          await db.onClienteMutation();
          notifyAuthStateChange();
          return cliente;
        },
        {} as Cliente,
        options,
      );
    },

    signIn(email: string, senha: string, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        async () => {
          const credencial = db.clienteCredenciais.find((c) => c.email === email);
          const cliente = credencial ? db.clientes.find((c) => c.id === credencial.clienteId) : undefined;
          if (!cliente || credencial?.password !== senha) {
            throw new Error('[mock] Credenciais inválidas.');
          }
          if (cliente.bloqueado) {
            throw new Error(`[mock] Cliente bloqueado: ${cliente.motivo_bloqueio ?? 'sem motivo informado'}`);
          }
          db.sessionClienteId = cliente.id;
          await db.onClienteMutation();
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
    requestPasswordReset(email: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAsync(
        () => {
          requestedPasswordRecoveryClienteId =
            db.clienteCredenciais.find((credential) => credential.email === email)?.clienteId ?? null;
          passwordRecoveryClienteId = null;
        },
        undefined,
        options,
      );
    },

    /** Story 2.7 (AC6) — valida a rota e ativa somente a conta solicitada sem expor enumeração. */
    establishPasswordRecoverySession(callbackUrl: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAsync(
        () => {
          passwordRecoveryClienteId = null;
          assertPasswordRecoveryCallback(callbackUrl);
          if (!requestedPasswordRecoveryClienteId) {
            throw new Error('[mock] auth.establishPasswordRecoverySession — callback sem sessão válida.');
          }
          passwordRecoveryClienteId = requestedPasswordRecoveryClienteId;
          requestedPasswordRecoveryClienteId = null;
        },
        undefined,
        options,
      );
    },

    /** Story 2.7 (AC6) — exige sessão de recuperação e troca somente a senha dessa conta. */
    updatePassword(password: string, options?: AsyncCallOptions): Promise<void> {
      return simulateAsync(
        async () => {
          if (!passwordRecoveryClienteId) {
            throw new Error('[mock] Nenhuma sessão de recuperação ativa.');
          }
          const credencial = db.clienteCredenciais.find((item) => item.clienteId === passwordRecoveryClienteId);
          if (!credencial) {
            passwordRecoveryClienteId = null;
            throw new Error('[mock] Nenhuma sessão de recuperação ativa.');
          }
          credencial.password = password;
          passwordRecoveryClienteId = null;
          await db.onClienteMutation();
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
        async () => {
          db.sessionClienteId = null;
          await db.onClienteMutation();
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
        async () => {
          if (db.sessionClienteId !== clienteId) {
            throw new Error('[mock] updateProfile — clienteId não corresponde à sessão autenticada.');
          }
          const cliente = db.clientes.find((c) => c.id === clienteId);
          if (!cliente) {
            throw new Error(`[mock] Cliente não encontrado: ${clienteId}`);
          }
          let changed = false;
          if (input.nome !== undefined) {
            const nome = input.nome.trim();
            if (!nome) {
              throw new Error('[mock] updateProfile — nome não pode ser vazio.');
            }
            if (cliente.nome !== nome) {
              cliente.nome = nome;
              changed = true;
            }
          }
          if (input.telefone !== undefined) {
            const telefone = input.telefone?.trim() || null;
            if (cliente.telefone !== telefone) {
              cliente.telefone = telefone;
              changed = true;
            }
          }
          if (changed) {
            await db.onClienteMutation();
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
        async () => {
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
            db.clienteCredenciais.push({
              clienteId: db.sessionClienteId,
              email,
              password: CLIENTE_DEMO_INITIAL_PASSWORD,
            });
          }
          await db.onClienteMutation();
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

    /**
     * Story 6.5 (AC3) — "set once", defesa em profundidade (mesmo padrão do
     * adapter Supabase, `auth.supabase.ts`): nunca sobrescreve um CPF já
     * salvo. Se `cliente.cpf` já estiver preenchido, esta chamada é um
     * no-op honesto — devolve o cliente ATUAL (com o CPF original), sem
     * erro e sem gravar o valor recebido.
     */
    updateCpf(clienteId: string, cpf: string, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        async () => {
          const cliente = db.clientes.find((c) => c.id === clienteId);
          if (!cliente) {
            throw new Error(`[mock] Cliente não encontrado: ${clienteId}`);
          }
          if (cliente.cpf == null) {
            cliente.cpf = cpf;
            await db.onClienteMutation();
          }
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
