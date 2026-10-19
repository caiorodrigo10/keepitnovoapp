import { beforeEach, describe, expect, it } from 'vitest';

import { EmailJaExisteError } from '../supabase/auth-errors';
import type { LojistaAuthPort } from '../ports/lojista-auth.port';
import { createMockDb, type MockDb } from './db';
import { createLojistaAuthMock } from './lojista-auth.mock';

describe('lojista-auth.mock (Story 3.2, AC4, AC7)', () => {
  let db: MockDb;
  let port: LojistaAuthPort;

  beforeEach(() => {
    db = createMockDb();
    port = createLojistaAuthMock(db);
  });

  it('signUp resolve com id/email/criado_em, sem nenhum campo de domínio (nunca um Cliente/Estabelecimento fantasma)', async () => {
    const conta = await port.signUp(
      {
        nome_fantasia: 'Farmácia Vida',
        cnpj: '11.222.333/0001-44',
        telefone: '(11) 91234-5678',
        responsavel_nome: 'Fulano de Tal',
        email: 'novo.lojista@example.com',
        senha: 'senha1234',
      },
      { delayMs: 1 },
    );

    expect(conta).toMatchObject({ email: 'novo.lojista@example.com' });
    expect(typeof conta.id).toBe('string');
    expect(typeof conta.criado_em).toBe('string');
    expect(Object.keys(conta).sort()).toEqual(['criado_em', 'email', 'id']);
  });

  it('signUp NÃO cria linha em db.clientes nem em db.estabelecimentos (AC7, limite explícito do recorte)', async () => {
    const clientesAntes = db.clientes.length;
    const estabelecimentosAntes = db.estabelecimentos.length;

    await port.signUp(
      {
        nome_fantasia: 'Farmácia Vida',
        cnpj: '11.222.333/0001-44',
        telefone: '(11) 91234-5678',
        responsavel_nome: 'Fulano de Tal',
        email: 'sem-orfao@example.com',
        senha: 'senha1234',
      },
      { delayMs: 1 },
    );

    expect(db.clientes.length).toBe(clientesAntes);
    expect(db.estabelecimentos.length).toBe(estabelecimentosAntes);
  });

  it('signUp rejeita e-mail já cadastrado com EmailJaExisteError — paridade com o adapter Supabase', async () => {
    const input = {
      nome_fantasia: 'Farmácia Vida',
      cnpj: '11.222.333/0001-44',
      telefone: '(11) 91234-5678',
      responsavel_nome: 'Fulano de Tal',
      email: 'duplicado@example.com',
      senha: 'senha1234',
    };

    await port.signUp(input, { delayMs: 1 });
    await expect(port.signUp(input, { delayMs: 1 })).rejects.toBeInstanceOf(EmailJaExisteError);
  });

  it('is genuinely asynchronous — não resolve no mesmo tick', () => {
    let resolved = false;
    const promise = port
      .signUp(
        {
          nome_fantasia: 'Farmácia Vida',
          cnpj: '11.222.333/0001-44',
          telefone: '(11) 91234-5678',
          responsavel_nome: 'Fulano de Tal',
          email: 'async@example.com',
          senha: 'senha1234',
        },
        { delayMs: 0 },
      )
      .then(() => {
        resolved = true;
      });
    expect(resolved).toBe(false);
    return promise;
  });

  it('forceError rejeita a Promise', async () => {
    await expect(
      port.signUp(
        {
          nome_fantasia: 'Farmácia Vida',
          cnpj: '11.222.333/0001-44',
          telefone: '(11) 91234-5678',
          responsavel_nome: 'Fulano de Tal',
          email: 'erro@example.com',
          senha: 'senha1234',
        },
        { forceError: true, delayMs: 1 },
      ),
    ).rejects.toThrow();
  });
});

describe('lojista-auth.mock — signIn/signOut/getCadastroMetadata (Story 3.10, AC1, AC4, AC6)', () => {
  let db: MockDb;
  let port: LojistaAuthPort;

  beforeEach(() => {
    db = createMockDb();
    port = createLojistaAuthMock(db);
  });

  async function signUpDemo(email: string): Promise<void> {
    await port.signUp(
      {
        nome_fantasia: 'Farmácia Vida',
        cnpj: '11.222.333/0001-44',
        telefone: '(11) 91234-5678',
        responsavel_nome: 'Fulano de Tal',
        email,
        senha: 'senha1234',
      },
      { delayMs: 1 },
    );
  }

  it('signIn resolve com a conta existente e grava db.sessionLojistaUserId — senha nunca validada (paridade Cliente/Admin)', async () => {
    await signUpDemo('lojista@example.com');
    db.sessionLojistaUserId = null; // signUp já loga — simula um app novo antes do login.

    const conta = await port.signIn('lojista@example.com', 'qualquer-coisa', { delayMs: 1 });

    expect(conta.email).toBe('lojista@example.com');
    expect(db.sessionLojistaUserId).toBe(conta.id);
  });

  it('signIn rejeita e-mail sem signUp prévio — falha honesta, nunca sucesso fictício (AC1, AC6)', async () => {
    await expect(port.signIn('desconhecido@example.com', 'x', { delayMs: 1 })).rejects.toThrow();
  });

  it('signOut limpa db.sessionLojistaUserId', async () => {
    await signUpDemo('sair@example.com');
    expect(db.sessionLojistaUserId).not.toBeNull();

    await port.signOut({ delayMs: 1 });

    expect(db.sessionLojistaUserId).toBeNull();
  });

  it('getCadastroMetadata resolve os 4 campos do Passo 1 gravados no signUp (AC4)', async () => {
    await signUpDemo('metadata@example.com');

    const metadata = await port.getCadastroMetadata({ delayMs: 1 });

    expect(metadata).toEqual({
      nome_fantasia: 'Farmácia Vida',
      cnpj: '11.222.333/0001-44',
      telefone: '(11) 91234-5678',
      responsavel_nome: 'Fulano de Tal',
    });
  });

  it('getCadastroMetadata resolve null sem sessão ativa', async () => {
    const metadata = await port.getCadastroMetadata({ delayMs: 1 });
    expect(metadata).toBeNull();
  });
});
