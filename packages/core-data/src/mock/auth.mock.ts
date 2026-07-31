import type { AuthPort, Cliente, ClienteConfirmacaoTelefone, SignUpInput } from '../ports/auth.port';
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
