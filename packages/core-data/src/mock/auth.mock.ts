import type { AuthPort, Cliente, ClienteConfirmacaoTelefone, SignUpInput } from '../ports/auth.port';
import type { AsyncCallOptions } from '../types';
import { generateMockId, simulateAsync } from './async-helpers';
import type { MockDb } from './db';

export function createAuthMock(db: MockDb): AuthPort {
  return {
    signUp(input: SignUpInput, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        () => {
          const cliente: Cliente = {
            id: generateMockId('cliente'),
            nome: input.nome,
            telefone: input.telefone,
            telefone_confirmado: false,
            cpf: null,
            bloqueado: false,
            motivo_bloqueio: null,
            criado_em: new Date().toISOString(),
          };
          db.clientes.push(cliente);
          db.sessionClienteId = cliente.id;
          return cliente;
        },
        {} as Cliente,
        options,
      );
    },

    signIn(telefone: string, options?: AsyncCallOptions): Promise<Cliente> {
      return simulateAsync(
        () => {
          const cliente = db.clientes.find((c) => c.telefone === telefone);
          if (!cliente) {
            throw new Error(`[mock] Cliente não encontrado para telefone ${telefone}`);
          }
          if (cliente.bloqueado) {
            throw new Error(`[mock] Cliente bloqueado: ${cliente.motivo_bloqueio ?? 'sem motivo informado'}`);
          }
          db.sessionClienteId = cliente.id;
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
          cliente.telefone_confirmado = true;
          const confirmacao: ClienteConfirmacaoTelefone = {
            id: generateMockId('confirmacao'),
            cliente_id: clienteId,
            telefone: cliente.telefone,
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
  };
}
