import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthPort, Cliente } from '../ports/auth.port';
import { createAuthMock } from './auth.mock';
import { createMockDb, type MockDb } from './db';

describe('auth.mock (contract)', () => {
  let db: MockDb;
  let port: AuthPort;

  beforeEach(() => {
    db = createMockDb();
    port = createAuthMock(db);
  });

  it('signUp resolves with the shape of Cliente (Story 2.3 — sem telefone_confirmado, sem email)', async () => {
    const cliente = await port.signUp(
      { nome: 'Novo Cliente', email: 'novo.cliente@example.com', senha: 'senha1234', telefone: '+5511900000000' },
      { delayMs: 1 },
    );
    expect(cliente).toMatchObject({
      nome: 'Novo Cliente',
      telefone: '+5511900000000',
      bloqueado: false,
    });
    expect(cliente).not.toHaveProperty('telefone_confirmado');
    expect(cliente).not.toHaveProperty('email');
    expect(typeof cliente.id).toBe('string');
  });

  it('signIn finds a seeded fixture by email (Story 2.3 — decisão 10.4)', async () => {
    const cliente = await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });
    expect(cliente.nome).toBe('Ana Souza');
  });

  it('currentUser reflects the mock session after signIn/signOut', async () => {
    expect(await port.currentUser({ delayMs: 1 })).toBeNull();
    await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });
    expect((await port.currentUser({ delayMs: 1 }))?.nome).toBe('Ana Souza');
    await port.signOut({ delayMs: 1 });
    expect(await port.currentUser({ delayMs: 1 })).toBeNull();
  });

  it('is genuinely asynchronous — does not resolve on the same tick', () => {
    let resolved = false;
    const promise = port.currentUser({ delayMs: 0 }).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    return promise;
  });

  it('forceError rejects the Promise', async () => {
    await expect(port.currentUser({ forceError: true, delayMs: 1 })).rejects.toThrow();
  });

  it('forceEmpty resolves with an empty/null value without throwing', async () => {
    await expect(port.currentUser({ forceEmpty: true, delayMs: 1 })).resolves.toBeNull();
  });

  it('getById resolves a Cliente by id, or null when not found (Story 1.10, Task 3)', async () => {
    const cliente = await port.getById('lj-cliente-thiago', { delayMs: 1 });
    expect(cliente?.nome).toBe('Thiago F.');

    expect(await port.getById('cliente-inexistente', { delayMs: 1 })).toBeNull();
  });

  it('updateCpf writes clientes.cpf (Story 1.10, Task 3)', async () => {
    const cliente = await port.updateCpf('cliente-ana', '12345678900', { delayMs: 1 });
    expect(cliente.cpf).toBe('12345678900');
  });

  describe('perfil real (Story 2.8, AC1-AC6)', () => {
    it('currentEmail reflete a sessão mock atual e null sem sessão', async () => {
      expect(await port.currentEmail({ delayMs: 1 })).toBeNull();
      await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });
      expect(await port.currentEmail({ delayMs: 1 })).toBe('ana.souza@example.com');
      await port.signOut({ delayMs: 1 });
      expect(await port.currentEmail({ delayMs: 1 })).toBeNull();
    });

    it('updateProfile atualiza nome e telefone do próprio cliente (AC3, AC4)', async () => {
      await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });
      const atualizado = await port.updateProfile(
        'cliente-ana',
        { nome: 'Ana Souza Silva', telefone: '(11) 91234-5678' },
        { delayMs: 1 },
      );
      expect(atualizado.nome).toBe('Ana Souza Silva');
      expect(atualizado.telefone).toBe('(11) 91234-5678');
    });

    it('updateProfile limpa telefone com null, sem disparar SMS/verificação (AC4, decisão 10.4)', async () => {
      await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });
      const atualizado = await port.updateProfile('cliente-ana', { telefone: null }, { delayMs: 1 });
      expect(atualizado.telefone).toBeNull();
    });

    it('updateProfile rejeita nome vazio sem persistir (AC3)', async () => {
      await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });
      await expect(port.updateProfile('cliente-ana', { nome: '   ' }, { delayMs: 1 })).rejects.toThrow(
        /nome não pode ser vazio/,
      );
      expect((await port.currentUser({ delayMs: 1 }))?.nome).toBe('Ana Souza');
    });

    it('updateProfile rejeita clienteId que não corresponde à sessão autenticada — autorização negativa (AC6)', async () => {
      await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });
      await expect(
        port.updateProfile('lj-cliente-thiago', { nome: 'Invasor' }, { delayMs: 1 }),
      ).rejects.toThrow(/não corresponde à sessão autenticada/);
    });

    it('updateEmail atualiza clienteCredenciais e devolve status updated (AC5, parity mock)', async () => {
      await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });
      await expect(port.updateEmail('nova.ana@example.com', { delayMs: 1 })).resolves.toEqual({
        status: 'updated',
      });
      expect(await port.currentEmail({ delayMs: 1 })).toBe('nova.ana@example.com');
    });

    it('updateEmail rejeita sem sessão ativa', async () => {
      await expect(port.updateEmail('novo@example.com', { delayMs: 1 })).rejects.toThrow(/nenhuma sessão ativa/);
    });
  });

  describe('recuperação de senha (Story 2.7, AC6)', () => {
    it('requestPasswordReset/establishPasswordRecoverySession/updatePassword não chamam serviço externo nem alteram fixtures', async () => {
      const clientesAntes = structuredClone(db.clientes);
      const credenciaisAntes = structuredClone(db.clienteCredenciais);

      await expect(port.requestPasswordReset('ana.souza@example.com', { delayMs: 1 })).resolves.toBeUndefined();
      await expect(
        port.establishPasswordRecoverySession('com.keepithub.cliente://auth/reset', { delayMs: 1 }),
      ).resolves.toBeUndefined();
      await expect(port.updatePassword('nova-senha', { delayMs: 1 })).resolves.toBeUndefined();

      expect(db.clientes).toEqual(clientesAntes);
      expect(db.clienteCredenciais).toEqual(credenciaisAntes);
    });

    it('requestPasswordReset resolve igualmente para e-mail cadastrado ou não — anti-enumeração (AC7)', async () => {
      await expect(port.requestPasswordReset('ana.souza@example.com', { delayMs: 1 })).resolves.toBeUndefined();
      await expect(port.requestPasswordReset('nao-cadastrado@example.com', { delayMs: 1 })).resolves.toBeUndefined();
    });

    it('updatePassword rejeita sem establishPasswordRecoverySession prévio', async () => {
      await expect(port.updatePassword('nova-senha', { delayMs: 1 })).rejects.toThrow(
        /nenhuma sessão de recuperação ativa/i,
      );
    });

    it('updatePassword consome a sessão de recuperação — uma 2ª chamada exige novo establishPasswordRecoverySession', async () => {
      await port.establishPasswordRecoverySession('com.keepithub.cliente://auth/reset', { delayMs: 1 });
      await expect(port.updatePassword('nova-senha', { delayMs: 1 })).resolves.toBeUndefined();
      await expect(port.updatePassword('outra-senha', { delayMs: 1 })).rejects.toThrow(
        /nenhuma sessão de recuperação ativa/i,
      );
    });
  });

  describe('onAuthStateChange (Story 2.3.1, Task 2/7, AC1)', () => {
    it('notifica o estado atual (null) para quem se inscreve antes de qualquer signUp/signIn', async () => {
      const received: (Cliente | null)[] = [];
      port.onAuthStateChange((cliente) => received.push(cliente));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(received).toEqual([null]);
    });

    it('signUp/signIn disparam o callback com o Cliente correto', async () => {
      const received: (Cliente | null)[] = [];
      port.onAuthStateChange((cliente) => received.push(cliente));
      await new Promise((resolve) => setTimeout(resolve, 10));

      const cliente = await port.signUp(
        { nome: 'Nova Cliente', email: 'nova@example.com', senha: 'senha1234', telefone: null },
        { delayMs: 1 },
      );

      expect(received.at(-1)?.id).toBe(cliente.id);

      await port.signOut({ delayMs: 1 });
      const outro = await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });

      expect(received.at(-1)?.nome).toBe(outro.nome);
    });

    it('signOut dispara o callback com null', async () => {
      await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });

      const received: (Cliente | null)[] = [];
      port.onAuthStateChange((cliente) => received.push(cliente));
      await new Promise((resolve) => setTimeout(resolve, 10));

      await port.signOut({ delayMs: 1 });

      expect(received.at(-1)).toBeNull();
    });

    it('a função de unsubscribe retornada para de notificar o callback', async () => {
      const received: (Cliente | null)[] = [];
      const unsubscribe = port.onAuthStateChange((cliente) => received.push(cliente));
      await new Promise((resolve) => setTimeout(resolve, 10));

      unsubscribe();
      await port.signIn('ana.souza@example.com', 'senha-qualquer', { delayMs: 1 });

      expect(received).toEqual([null]);
    });
  });
});
