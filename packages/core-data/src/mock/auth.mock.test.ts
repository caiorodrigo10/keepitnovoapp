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

  it('signUp persiste a senha informada e signIn passa a validá-la', async () => {
    const cliente = await port.signUp(
      { nome: 'Nova Cliente', email: 'nova@example.com', senha: 'senha1234', telefone: null },
      { delayMs: 1 },
    );
    await port.signOut({ delayMs: 1 });

    await expect(port.signIn('nova@example.com', 'senha-errada', { delayMs: 1 })).rejects.toThrow(
      /credenciais inválidas/i,
    );
    await expect(port.signIn('nova@example.com', 'senha1234', { delayMs: 1 })).resolves.toMatchObject({
      id: cliente.id,
    });
  });

  it('signIn finds a seeded fixture by email (Story 2.3 — decisão 10.4)', async () => {
    const cliente = await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });
    expect(cliente.nome).toBe('Ana Souza');
  });

  it('signIn rejeita senha incorreta com erro genérico sem expor credenciais', async () => {
    const email = 'ana.souza@example.com';
    const password = 'segredo-incorreto';

    const error = await port.signIn(email, password, { delayMs: 1 }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/credenciais inválidas/i);
    expect((error as Error).message).not.toContain(email);
    expect((error as Error).message).not.toContain(password);
  });

  it('notifica persistência somente depois de mutações de autenticação bem-sucedidas', async () => {
    let mutationCount = 0;
    db.onClienteMutation = () => {
      mutationCount += 1;
    };

    await expect(port.signIn('ana.souza@example.com', 'senha-incorreta', { delayMs: 1 })).rejects.toThrow();
    expect(mutationCount).toBe(0);

    await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });
    expect(mutationCount).toBe(1);

    await expect(port.updateProfile('cliente-ana', { nome: '   ' }, { delayMs: 1 })).rejects.toThrow();
    expect(mutationCount).toBe(1);

    await port.updateProfile('cliente-ana', { nome: 'Ana Persistente' }, { delayMs: 1 });
    expect(mutationCount).toBe(2);
  });

  it('currentUser reflects the mock session after signIn/signOut', async () => {
    expect(await port.currentUser({ delayMs: 1 })).toBeNull();
    await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });
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

  it('updateCpf não sobrescreve um CPF já salvo — "set once" (Story 6.5, AC3)', async () => {
    let mutationCount = 0;
    db.onClienteMutation = () => {
      mutationCount += 1;
    };

    await port.updateCpf('cliente-ana', '11144477735', { delayMs: 1 });
    const atualizado = await port.updateCpf('cliente-ana', '52998224725', { delayMs: 1 });

    expect(atualizado.cpf).toBe('11144477735');
    expect(mutationCount).toBe(1);
  });

  describe('perfil real (Story 2.8, AC1-AC6)', () => {
    it('currentEmail reflete a sessão mock atual e null sem sessão', async () => {
      expect(await port.currentEmail({ delayMs: 1 })).toBeNull();
      await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });
      expect(await port.currentEmail({ delayMs: 1 })).toBe('ana.souza@example.com');
      await port.signOut({ delayMs: 1 });
      expect(await port.currentEmail({ delayMs: 1 })).toBeNull();
    });

    it('updateProfile atualiza nome e telefone do próprio cliente (AC3, AC4)', async () => {
      await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });
      const atualizado = await port.updateProfile(
        'cliente-ana',
        { nome: 'Ana Souza Silva', telefone: '(11) 91234-5678' },
        { delayMs: 1 },
      );
      expect(atualizado.nome).toBe('Ana Souza Silva');
      expect(atualizado.telefone).toBe('(11) 91234-5678');
    });

    it('updateProfile limpa telefone com null, sem disparar SMS/verificação (AC4, decisão 10.4)', async () => {
      await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });
      const atualizado = await port.updateProfile('cliente-ana', { telefone: null }, { delayMs: 1 });
      expect(atualizado.telefone).toBeNull();
    });

    it('updateProfile não persiste input vazio nem valores que normalizam para o estado atual', async () => {
      await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });
      let mutationCount = 0;
      db.onClienteMutation = () => {
        mutationCount += 1;
      };

      await expect(port.updateProfile('cliente-ana', {}, { delayMs: 1 })).resolves.toMatchObject({
        nome: 'Ana Souza',
        telefone: '+5511987654321',
      });
      await expect(
        port.updateProfile(
          'cliente-ana',
          { nome: '  Ana Souza  ', telefone: '  +5511987654321  ' },
          { delayMs: 1 },
        ),
      ).resolves.toMatchObject({ nome: 'Ana Souza', telefone: '+5511987654321' });

      expect(mutationCount).toBe(0);
    });

    it('updateProfile rejeita nome vazio sem persistir (AC3)', async () => {
      await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });
      await expect(port.updateProfile('cliente-ana', { nome: '   ' }, { delayMs: 1 })).rejects.toThrow(
        /nome não pode ser vazio/,
      );
      expect((await port.currentUser({ delayMs: 1 }))?.nome).toBe('Ana Souza');
    });

    it('updateProfile rejeita clienteId que não corresponde à sessão autenticada — autorização negativa (AC6)', async () => {
      await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });
      await expect(
        port.updateProfile('lj-cliente-thiago', { nome: 'Invasor' }, { delayMs: 1 }),
      ).rejects.toThrow(/não corresponde à sessão autenticada/);
    });

    it('updateEmail atualiza clienteCredenciais e devolve status updated (AC5, parity mock)', async () => {
      await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });
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
    it('updatePassword altera exclusivamente a conta solicitada e mantém a senha demo da Ana', async () => {
      const segunda = await port.signUp(
        { nome: 'Beatriz', email: 'beatriz@example.com', senha: 'senhaSegunda1', telefone: null },
        { delayMs: 1 },
      );
      await port.signOut({ delayMs: 1 });
      const result = await port.requestPasswordReset('beatriz@example.com', { delayMs: 1 });
      expect(result.delivery).toBe('demo');
      if (result.delivery !== 'demo') throw new Error('O adapter mock deve devolver callback demo.');
      await port.establishPasswordRecoverySession(result.callbackUrl, { delayMs: 1 });
      await port.updatePassword('novaSegunda2', { delayMs: 1 });

      await expect(port.signIn('beatriz@example.com', 'senhaSegunda1', { delayMs: 1 })).rejects.toThrow(
        /credenciais inválidas/i,
      );
      await expect(port.signIn('beatriz@example.com', 'novaSegunda2', { delayMs: 1 })).resolves.toMatchObject({
        id: segunda.id,
      });
      await port.signOut({ delayMs: 1 });
      await expect(port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 })).resolves.toMatchObject({
        id: 'cliente-ana',
      });
    });

    it('requestPasswordReset devolve somente um ID opaco no callback demo', async () => {
      const email = 'ana.souza@example.com';
      const password = 'keepit123';

      const result = await port.requestPasswordReset(email, { delayMs: 1 });

      expect(result).toMatchObject({ delivery: 'demo' });
      if (result.delivery !== 'demo') throw new Error('O adapter mock deve devolver callback demo.');
      const url = new URL(result.callbackUrl);
      expect(`${url.protocol}//${url.host}${url.pathname}`).toBe('com.keepithub.cliente://auth/reset');
      expect([...url.searchParams.keys()]).toEqual(['requestId']);
      expect(url.searchParams.get('requestId')).toMatch(/^recovery-[a-z0-9-]+$/);
      expect(url.hash).toBe('');
      expect(result.callbackUrl).not.toContain(email);
      expect(result.callbackUrl).not.toContain(password);
    });

    it('rejeita callback com userinfo e preserva a solicitação canônica', async () => {
      const result = await port.requestPasswordReset('ana.souza@example.com', { delayMs: 1 });
      if (result.delivery !== 'demo') throw new Error('O adapter mock deve devolver callback demo.');
      const callbackWithUserinfo = result.callbackUrl.replace('://', '://user:secret@');

      await expect(port.establishPasswordRecoverySession(callbackWithUserinfo, { delayMs: 1 })).rejects.toThrow(
        /link inválido|callback/i,
      );
      await expect(port.establishPasswordRecoverySession(result.callbackUrl, { delayMs: 1 })).resolves.toBeUndefined();
    });

    it('establishPasswordRecoverySession rejeita callback de outra rota e não ativa recuperação', async () => {
      const result = await port.requestPasswordReset('ana.souza@example.com', { delayMs: 1 });
      expect(result.delivery).toBe('demo');

      await expect(
        port.establishPasswordRecoverySession('com.keepithub.cliente://auth/other?requestId=recovery-opaque123', {
          delayMs: 1,
        }),
      ).rejects.toThrow(/callback de outra rota/i);
      await expect(port.updatePassword('nova-senha', { delayMs: 1 })).rejects.toThrow(
        /nenhuma sessão de recuperação ativa/i,
      );
    });

    it('requestPasswordReset resolve igualmente para e-mail cadastrado ou não — anti-enumeração (AC7)', async () => {
      const known = await port.requestPasswordReset('ana.souza@example.com', { delayMs: 1 });
      const unknown = await port.requestPasswordReset('nao-cadastrado@example.com', { delayMs: 1 });

      expect(known).toMatchObject({ delivery: 'demo', callbackUrl: expect.any(String) });
      expect(unknown).toMatchObject({ delivery: 'demo', callbackUrl: expect.any(String) });
      if (unknown.delivery !== 'demo') throw new Error('O adapter mock deve devolver callback demo.');
      await expect(port.establishPasswordRecoverySession(unknown.callbackUrl, { delayMs: 1 })).rejects.toThrow(
        /link inválido|sessão/i,
      );
    });

    it('updatePassword rejeita sem establishPasswordRecoverySession prévio', async () => {
      await expect(port.updatePassword('nova-senha', { delayMs: 1 })).rejects.toThrow(
        /nenhuma sessão de recuperação ativa/i,
      );
    });

    it('updatePassword consome a sessão de recuperação e impede replay', async () => {
      const result = await port.requestPasswordReset('ana.souza@example.com', { delayMs: 1 });
      if (result.delivery !== 'demo') throw new Error('O adapter mock deve devolver callback demo.');
      await port.establishPasswordRecoverySession(result.callbackUrl, { delayMs: 1 });
      await expect(port.updatePassword('nova-senha', { delayMs: 1 })).resolves.toBeUndefined();
      await expect(port.updatePassword('outra-senha', { delayMs: 1 })).rejects.toThrow(
        /consumid|nenhuma sessão de recuperação ativa/i,
      );
      await expect(port.establishPasswordRecoverySession(result.callbackUrl, { delayMs: 1 })).rejects.toThrow(
        /link inválido|consumid|sessão/i,
      );
    });

    it('nova solicitação usa outro ID, invalida o callback anterior e preserva o mais novo', async () => {
      const first = await port.requestPasswordReset('ana.souza@example.com', { delayMs: 1 });
      const second = await port.requestPasswordReset('ana.souza@example.com', { delayMs: 1 });
      if (first.delivery !== 'demo' || second.delivery !== 'demo') {
        throw new Error('O adapter mock deve devolver callbacks demo.');
      }

      expect(second.callbackUrl).not.toBe(first.callbackUrl);
      await expect(port.establishPasswordRecoverySession(first.callbackUrl, { delayMs: 1 })).rejects.toThrow(
        /link inválido|sessão/i,
      );
      await expect(port.establishPasswordRecoverySession(second.callbackUrl, { delayMs: 1 })).resolves.toBeUndefined();
      await expect(port.updatePassword('senha-mais-nova', { delayMs: 1 })).resolves.toBeUndefined();
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
      const outro = await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });

      expect(received.at(-1)?.nome).toBe(outro.nome);
    });

    it('signOut dispara o callback com null', async () => {
      await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });

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
      await port.signIn('ana.souza@example.com', 'keepit123', { delayMs: 1 });

      expect(received).toEqual([null]);
    });
  });
});
