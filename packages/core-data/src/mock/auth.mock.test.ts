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
