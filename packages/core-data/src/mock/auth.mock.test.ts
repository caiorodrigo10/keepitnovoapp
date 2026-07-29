import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthPort } from '../ports/auth.port';
import { createAuthMock } from './auth.mock';
import { createMockDb, type MockDb } from './db';

describe('auth.mock (contract)', () => {
  let db: MockDb;
  let port: AuthPort;

  beforeEach(() => {
    db = createMockDb();
    port = createAuthMock(db);
  });

  it('signUp resolves with the shape of Cliente', async () => {
    const cliente = await port.signUp({ nome: 'Novo Cliente', telefone: '+5511900000000' }, { delayMs: 1 });
    expect(cliente).toMatchObject({
      nome: 'Novo Cliente',
      telefone: '+5511900000000',
      telefone_confirmado: false,
      bloqueado: false,
    });
    expect(typeof cliente.id).toBe('string');
  });

  it('signIn finds a seeded fixture by telefone', async () => {
    const cliente = await port.signIn('+5511987654321', { delayMs: 1 });
    expect(cliente.nome).toBe('Ana Souza');
  });

  it('currentUser reflects the mock session after signIn/signOut', async () => {
    expect(await port.currentUser({ delayMs: 1 })).toBeNull();
    await port.signIn('+5511987654321', { delayMs: 1 });
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
});
