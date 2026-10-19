import { beforeEach, describe, expect, it } from 'vitest';

import {
  AutenticacaoNecessariaError,
  CadastroJaProcessadoError,
  CnpjDuplicadoError,
  HorariosInvalidosError,
} from '../supabase/estabelecimento-cadastro-errors';
import type { CriarEstabelecimentoInput, EstabelecimentoCadastroPort } from '../ports/estabelecimento-cadastro.port';
import { createMockDb, type MockDb } from './db';
import { createEstabelecimentoCadastroMock } from './estabelecimento-cadastro.mock';
import { createLojistaAuthMock } from './lojista-auth.mock';

function horarios7() {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: dia_semana !== 0,
    hora_abre: dia_semana !== 0 ? '09:00' : '',
    hora_fecha: dia_semana !== 0 ? '18:00' : '',
  }));
}

function baseInput(overrides: Partial<CriarEstabelecimentoInput> = {}): CriarEstabelecimentoInput {
  return {
    nome_fantasia: 'Farmácia Vida',
    cnpj: '11.222.333/0001-44',
    responsavel_nome: 'Fulano de Tal',
    telefone: '(11) 91234-5678',
    categoria: 'farmacia',
    endereco: 'Rua das Flores, 100',
    lat: null,
    lng: null,
    raio_atendimento_km: 3,
    tempo_medio_entrega_min: 30,
    taxa_deslocamento_reais: 0,
    ticket_minimo_reais: null,
    chave_pix: 'contato@farmaciavida.com.br',
    chave_pix_tipo: 'email',
    foto_fachada_url: null,
    descricao: null,
    horarios: horarios7(),
    ...overrides,
  };
}

async function signUpLojista(db: MockDb, email: string): Promise<void> {
  const authPort = createLojistaAuthMock(db);
  await authPort.signUp(
    {
      nome_fantasia: 'Farmácia Vida',
      cnpj: '00.000.000/0001-00',
      telefone: '(11) 90000-0000',
      responsavel_nome: 'Responsável',
      email,
      senha: 'senha1234',
    },
    { delayMs: 1 },
  );
}

describe('estabelecimento-cadastro.mock (Story 3.5, AC2, AC3, AC4)', () => {
  let db: MockDb;
  let port: EstabelecimentoCadastroPort;

  beforeEach(() => {
    db = createMockDb();
    port = createEstabelecimentoCadastroMock(db);
  });

  describe('criarCadastro', () => {
    it('rejeita com AutenticacaoNecessariaError sem sessão de lojista (sem signUp prévio)', async () => {
      await expect(port.criarCadastro(baseInput(), { delayMs: 1 })).rejects.toBeInstanceOf(
        AutenticacaoNecessariaError,
      );
    });

    it('cria o estabelecimento + 7 horários (AC3) quando há sessão de lojista', async () => {
      await signUpLojista(db, 'lojista1@example.com');

      const antes = db.estabelecimentosCadastrados.length;
      const resultado = await port.criarCadastro(baseInput(), { delayMs: 1 });

      expect(typeof resultado.id).toBe('string');
      expect(resultado.id.length).toBeGreaterThan(0);
      expect(db.estabelecimentosCadastrados.length).toBe(antes + 1);
      expect(db.estabelecimentosCadastrados[db.estabelecimentosCadastrados.length - 1]).toMatchObject({
        cnpj: baseInput().cnpj,
        status: 'em_analise',
      });
    });

    it('NÃO escreve em db.estabelecimentos (domínio de Descoberta do Cliente, StorePort)', async () => {
      await signUpLojista(db, 'lojista2@example.com');
      const antes = db.estabelecimentos.length;

      await port.criarCadastro(baseInput({ cnpj: '22.333.444/0001-55' }), { delayMs: 1 });

      expect(db.estabelecimentos.length).toBe(antes);
    });

    it('rejeita com HorariosInvalidosError quando horarios não tem exatamente 7 entradas', async () => {
      await signUpLojista(db, 'lojista3@example.com');

      await expect(
        port.criarCadastro(baseInput({ horarios: horarios7().slice(0, 6) }), { delayMs: 1 }),
      ).rejects.toBeInstanceOf(HorariosInvalidosError);
    });

    it('reenvio idempotente (AC3) — mesma sessão, mesmo id, sem criar segunda linha', async () => {
      await signUpLojista(db, 'lojista4@example.com');

      const primeiro = await port.criarCadastro(baseInput({ cnpj: '33.444.555/0001-66' }), { delayMs: 1 });
      const antes = db.estabelecimentosCadastrados.length;
      const segundo = await port.criarCadastro(baseInput({ cnpj: '33.444.555/0001-66' }), { delayMs: 1 });

      expect(segundo.id).toBe(primeiro.id);
      expect(db.estabelecimentosCadastrados.length).toBe(antes);
    });

    it('rejeita com CadastroJaProcessadoError quando o cadastro do próprio dono já saiu de em_analise (AC4)', async () => {
      await signUpLojista(db, 'lojista5@example.com');
      const criado = await port.criarCadastro(baseInput({ cnpj: '44.555.666/0001-77' }), { delayMs: 1 });

      const registro = db.estabelecimentosCadastrados.find((e) => e.id === criado.id);
      expect(registro).toBeDefined();
      registro!.status = 'ativo';

      await expect(
        port.criarCadastro(baseInput({ cnpj: '44.555.666/0001-77' }), { delayMs: 1 }),
      ).rejects.toBeInstanceOf(CadastroJaProcessadoError);
    });

    it('rejeita com CnpjDuplicadoError quando o CNPJ pertence a outro dono (AC4) — sem vazar sucesso', async () => {
      await signUpLojista(db, 'dono-a@example.com');
      await port.criarCadastro(baseInput({ cnpj: '55.666.777/0001-88' }), { delayMs: 1 });

      await signUpLojista(db, 'dono-b@example.com'); // troca a sessão mock para "outro lojista"
      await expect(
        port.criarCadastro(baseInput({ cnpj: '55.666.777/0001-88' }), { delayMs: 1 }),
      ).rejects.toBeInstanceOf(CnpjDuplicadoError);
    });

    it('forceError rejeita a Promise (AsyncCallOptions)', async () => {
      await signUpLojista(db, 'lojista6@example.com');
      await expect(port.criarCadastro(baseInput(), { forceError: true, delayMs: 1 })).rejects.toThrow();
    });
  });

  describe('uploadFachada', () => {
    it('rejeita com AutenticacaoNecessariaError sem sessão de lojista', async () => {
      await expect(
        port.uploadFachada({ uri: 'file:///tmp/fachada.jpg', ext: 'jpg' }, { delayMs: 1 }),
      ).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
    });

    it('resolve com o path convencionado `${uid}/fachada.<ext>` (AC2) — foto informada', async () => {
      await signUpLojista(db, 'lojista-foto@example.com');
      const uid = db.sessionLojistaUserId;

      const path = await port.uploadFachada({ uri: 'file:///tmp/fachada.png', ext: 'png' }, { delayMs: 1 });

      expect(path).toBe(`${uid}/fachada.png`);
    });
  });

  describe('getMeuEstabelecimento (Story 3.10, AC2-AC6)', () => {
    it('resolve null sem sessão de lojista', async () => {
      const resultado = await port.getMeuEstabelecimento({ delayMs: 1 });
      expect(resultado).toBeNull();
    });

    it('resolve null quando a conta existe mas não há nenhuma linha (AC4 — "0 linhas" nunca é erro)', async () => {
      await signUpLojista(db, 'sem-estabelecimento@example.com');

      const resultado = await port.getMeuEstabelecimento({ delayMs: 1 });

      expect(resultado).toBeNull();
    });

    it('resolve status "em_analise" logo após criarCadastro (AC2)', async () => {
      await signUpLojista(db, 'em-analise@example.com');
      await port.criarCadastro(baseInput({ cnpj: '66.777.888/0001-99' }), { delayMs: 1 });

      const resultado = await port.getMeuEstabelecimento({ delayMs: 1 });

      expect(resultado).toEqual({ status: 'em_analise', motivo_rejeicao: null });
    });

    it('resolve status "ativo" quando o registro foi aprovado (AC2)', async () => {
      await signUpLojista(db, 'ativo@example.com');
      const criado = await port.criarCadastro(baseInput({ cnpj: '77.888.999/0001-00' }), { delayMs: 1 });
      const registro = db.estabelecimentosCadastrados.find((e) => e.id === criado.id);
      registro!.status = 'ativo';

      const resultado = await port.getMeuEstabelecimento({ delayMs: 1 });

      expect(resultado).toEqual({ status: 'ativo', motivo_rejeicao: null });
    });

    it('resolve status "rejeitado" com motivo_rejeicao íntegro (AC3)', async () => {
      await signUpLojista(db, 'rejeitado@example.com');
      const criado = await port.criarCadastro(baseInput({ cnpj: '88.999.000/0001-11' }), { delayMs: 1 });
      const registro = db.estabelecimentosCadastrados.find((e) => e.id === criado.id);
      registro!.status = 'rejeitado';
      registro!.motivoRejeicao = 'CNPJ divergente do informado na Receita.';

      const resultado = await port.getMeuEstabelecimento({ delayMs: 1 });

      expect(resultado).toEqual({ status: 'rejeitado', motivo_rejeicao: 'CNPJ divergente do informado na Receita.' });
    });

    it('resolve status "suspenso" sem inventar motivo_rejeicao (AC5)', async () => {
      await signUpLojista(db, 'suspenso@example.com');
      const criado = await port.criarCadastro(baseInput({ cnpj: '99.000.111/0001-22' }), { delayMs: 1 });
      const registro = db.estabelecimentosCadastrados.find((e) => e.id === criado.id);
      registro!.status = 'suspenso';

      const resultado = await port.getMeuEstabelecimento({ delayMs: 1 });

      expect(resultado).toEqual({ status: 'suspenso', motivo_rejeicao: null });
    });

    it('só resolve o cadastro da sessão atual — não vaza o cadastro de outro dono (AC6)', async () => {
      await signUpLojista(db, 'dono-x@example.com');
      await port.criarCadastro(baseInput({ cnpj: '10.111.222/0001-33' }), { delayMs: 1 });

      await signUpLojista(db, 'dono-y@example.com'); // troca a sessão mock para outro lojista, sem cadastro próprio

      const resultado = await port.getMeuEstabelecimento({ delayMs: 1 });

      expect(resultado).toBeNull();
    });
  });

  describe('getMeuPerfil (Story 3.11, AC1, AC4)', () => {
    it('resolve null sem sessão de lojista', async () => {
      const resultado = await port.getMeuPerfil({ delayMs: 1 });
      expect(resultado).toBeNull();
    });

    it('resolve null quando a conta existe mas não há nenhum estabelecimento ainda', async () => {
      await signUpLojista(db, 'sem-estabelecimento-perfil@example.com');
      const resultado = await port.getMeuPerfil({ delayMs: 1 });
      expect(resultado).toBeNull();
    });

    it('prefill correto (nome_fantasia, categoria, descricao, horarios) logo após criarCadastro', async () => {
      await signUpLojista(db, 'perfil1@example.com');
      await port.criarCadastro(
        baseInput({ cnpj: '11.111.111/0001-11', descricao: 'Farmácia de bairro' }),
        { delayMs: 1 },
      );

      const resultado = await port.getMeuPerfil({ delayMs: 1 });

      expect(resultado).toMatchObject({
        nome_fantasia: 'Farmácia Vida',
        categoria: 'farmacia',
        descricao: 'Farmácia de bairro',
      });
      expect(resultado?.horarios).toHaveLength(7);
    });

    it('horários vazio honesto ([]) quando o array salvo não tem 7 linhas (defensivo)', async () => {
      // Estado só alcançável manipulando o registro diretamente (criarCadastro
      // sempre grava 7 linhas) — exercita a leitura honesta do array como está.
      await signUpLojista(db, 'perfil-horarios-vazio@example.com');
      await port.criarCadastro(baseInput({ cnpj: '12.111.111/0001-12' }), { delayMs: 1 });
      const registro = db.estabelecimentosCadastrados.find((e) => e.donoUserId === db.sessionLojistaUserId);
      registro!.horarios = [];

      const resultado = await port.getMeuPerfil({ delayMs: 1 });

      expect(resultado?.horarios).toEqual([]);
    });

    it('foto_fachada_url_assinada reaproveita o path bruto salvo (mock sem Storage real)', async () => {
      await signUpLojista(db, 'perfil-foto@example.com');
      await port.criarCadastro(baseInput({ cnpj: '13.111.111/0001-13' }), { delayMs: 1 });
      const uid = db.sessionLojistaUserId;
      const registro = db.estabelecimentosCadastrados.find((e) => e.donoUserId === uid);
      registro!.fotoFachadaUrl = `${uid}/fachada.jpg`;

      const resultado = await port.getMeuPerfil({ delayMs: 1 });

      expect(resultado?.foto_fachada_url_assinada).toBe(`${uid}/fachada.jpg`);
    });

    it('não vaza o perfil de outro dono (mesma defesa de getMeuEstabelecimento)', async () => {
      await signUpLojista(db, 'dono-perfil-a@example.com');
      await port.criarCadastro(baseInput({ cnpj: '14.111.111/0001-14' }), { delayMs: 1 });

      await signUpLojista(db, 'dono-perfil-b@example.com');

      const resultado = await port.getMeuPerfil({ delayMs: 1 });
      expect(resultado).toBeNull();
    });
  });

  describe('atualizarMeuPerfil (Story 3.11, AC2, AC3)', () => {
    it('rejeita com AutenticacaoNecessariaError sem sessão de lojista', async () => {
      await expect(
        port.atualizarMeuPerfil({ categoria: 'restaurante', descricao: 'novo' }, { delayMs: 1 }),
      ).rejects.toBeInstanceOf(AutenticacaoNecessariaError);
    });

    it('rejeita honestamente quando a sessão existe mas não há estabelecimento ainda (sem sucesso simulado)', async () => {
      await signUpLojista(db, 'sem-estabelecimento-update@example.com');
      await expect(
        port.atualizarMeuPerfil({ categoria: 'restaurante', descricao: 'novo' }, { delayMs: 1 }),
      ).rejects.toThrow();
    });

    it('persiste categoria/descricao e devolve o perfil atualizado', async () => {
      await signUpLojista(db, 'update1@example.com');
      await port.criarCadastro(baseInput({ cnpj: '15.111.111/0001-15' }), { delayMs: 1 });

      const resultado = await port.atualizarMeuPerfil(
        { categoria: 'restaurante', descricao: 'Nova descrição da loja' },
        { delayMs: 1 },
      );

      expect(resultado).toMatchObject({
        categoria: 'restaurante',
        descricao: 'Nova descrição da loja',
        nome_fantasia: 'Farmácia Vida',
      });
      const registro = db.estabelecimentosCadastrados.find((e) => e.donoUserId === db.sessionLojistaUserId);
      expect(registro).toMatchObject({ categoria: 'restaurante', descricao: 'Nova descrição da loja' });
    });

    it('nunca altera nome_fantasia/cnpj/status (AC2 — payload restrito só a categoria/descricao)', async () => {
      await signUpLojista(db, 'update2@example.com');
      await port.criarCadastro(baseInput({ cnpj: '16.111.111/0001-16' }), { delayMs: 1 });
      const registroAntes = db.estabelecimentosCadastrados.find((e) => e.donoUserId === db.sessionLojistaUserId);
      const cnpjAntes = registroAntes!.cnpj;
      const statusAntes = registroAntes!.status;

      await port.atualizarMeuPerfil({ categoria: 'pet', descricao: null }, { delayMs: 1 });

      const registroDepois = db.estabelecimentosCadastrados.find((e) => e.donoUserId === db.sessionLojistaUserId);
      expect(registroDepois!.nomeFantasia).toBe('Farmácia Vida');
      expect(registroDepois!.cnpj).toBe(cnpjAntes);
      expect(registroDepois!.status).toBe(statusAntes);
    });
  });

  describe('getMeuEstabelecimentoId (Stories 4.3/4.4)', () => {
    it('resolve null sem sessão de lojista', async () => {
      const resultado = await port.getMeuEstabelecimentoId({ delayMs: 1 });
      expect(resultado).toBeNull();
    });

    it('resolve null quando a conta existe mas não há nenhum cadastro ainda', async () => {
      await signUpLojista(db, 'sem-estabelecimento-id@example.com');
      const resultado = await port.getMeuEstabelecimentoId({ delayMs: 1 });
      expect(resultado).toBeNull();
    });

    it('resolve o id do PRÓPRIO estabelecimento do lojista autenticado', async () => {
      await signUpLojista(db, 'com-id@example.com');
      const criado = await port.criarCadastro(baseInput({ cnpj: '20.111.111/0001-20' }), { delayMs: 1 });

      const resultado = await port.getMeuEstabelecimentoId({ delayMs: 1 });

      expect(resultado).toBe(criado.id);
    });

    it('não vaza o id de outro dono (mesma defesa de getMeuEstabelecimento/getMeuPerfil)', async () => {
      await signUpLojista(db, 'dono-a@example.com');
      const criadoA = await port.criarCadastro(baseInput({ cnpj: '21.111.111/0001-21' }), { delayMs: 1 });

      await signUpLojista(db, 'dono-b@example.com'); // troca a sessão mock para outro lojista, sem cadastro próprio

      const resultado = await port.getMeuEstabelecimentoId({ delayMs: 1 });

      expect(resultado).toBeNull();
      expect(resultado).not.toBe(criadoA.id);
    });
  });
});
