import type {
  AtualizarMeuPerfilInput,
  CriarEstabelecimentoInput,
  EstabelecimentoCadastroPort,
  EstabelecimentoCadastroResult,
  FachadaUploadInput,
  HorarioCadastroInput,
  MeuEstabelecimentoStatus,
  MeuPerfilLojista,
} from '../ports/estabelecimento-cadastro.port';
import type { EstabelecimentoHorario } from '../ports/store.port';
import type { AsyncCallOptions } from '../types';
import {
  AutenticacaoNecessariaError,
  CadastroJaProcessadoError,
  CnpjDuplicadoError,
  HorariosInvalidosError,
} from '../supabase/estabelecimento-cadastro-errors';
import { generateMockId, simulateAsync } from './async-helpers';
import type { MockDb } from './db';

const EMPTY_RESULT: EstabelecimentoCadastroResult = { id: '' };

/** Story 3.11: `''` (contrato de `HorarioCadastroInput` quando `aberto = false`) vira `null` — mesma normalização honesta da RPC real (`NULLIF(v_dia->>'hora_abre', '')`, migration `20260812123048`). */
function mapHorariosCadastroParaHorario(horarios: HorarioCadastroInput[]): EstabelecimentoHorario[] {
  return horarios.map((h) => ({
    dia_semana: h.dia_semana,
    aberto: h.aberto,
    hora_abre: h.hora_abre || null,
    hora_fecha: h.hora_fecha || null,
  }));
}

const EMPTY_MEU_PERFIL: MeuPerfilLojista = {
  nome_fantasia: '',
  categoria: '',
  descricao: null,
  foto_fachada_url_assinada: null,
  horarios: [],
};

/**
 * Mock de `EstabelecimentoCadastroPort` — Story 3.5 (AC2, AC3, AC4).
 *
 * Paridade funcional com a RPC `criar_estabelecimento_completo`:
 * - Exige "sessão" (`db.sessionLojistaUserId`, ver JSDoc de `mock/db.ts`) —
 *   sem ela, `AutenticacaoNecessariaError` (mesmo sinal que a RPC dá quando
 *   `auth.uid()` é nulo).
 * - Exige exatamente 7 entradas em `horarios` — `HorariosInvalidosError`.
 * - Upsert idempotente por `donoUserId` (reenvio do MESMO lojista atualiza a
 *   própria linha `em_analise` — AC3), `CadastroJaProcessadoError` se a
 *   linha do próprio dono já saiu de `em_analise` (AC4), `CnpjDuplicadoError`
 *   se o CNPJ já pertence a OUTRO `donoUserId` (AC4).
 * - Nunca escreve em `db.estabelecimentos` (array de `StorePort`, domínio de
 *   Descoberta do Cliente) — usa `db.estabelecimentosCadastrados`, dedicado.
 */
export function createEstabelecimentoCadastroMock(db: MockDb): EstabelecimentoCadastroPort {
  return {
    uploadFachada(input: FachadaUploadInput, options?: AsyncCallOptions): Promise<string> {
      return simulateAsync(
        () => {
          if (!db.sessionLojistaUserId) {
            throw new AutenticacaoNecessariaError();
          }
          // Mock nunca toca rede/Storage — só espelha a convenção de path
          // real (`${uid}/fachada.<ext>`, migration `20260812123049`), sem
          // gravar bytes de verdade (não há um "bucket" mock).
          return `${db.sessionLojistaUserId}/fachada.${input.ext}`;
        },
        '',
        options,
      );
    },

    criarCadastro(
      input: CriarEstabelecimentoInput,
      options?: AsyncCallOptions,
    ): Promise<EstabelecimentoCadastroResult> {
      return simulateAsync(
        () => {
          if (!db.sessionLojistaUserId) {
            throw new AutenticacaoNecessariaError();
          }
          if (!Array.isArray(input.horarios) || input.horarios.length !== 7) {
            throw new HorariosInvalidosError();
          }

          const donoUserId = db.sessionLojistaUserId;

          const deOutroDono = db.estabelecimentosCadastrados.find(
            (cadastro) => cadastro.cnpj === input.cnpj && cadastro.donoUserId !== donoUserId,
          );
          if (deOutroDono) {
            throw new CnpjDuplicadoError();
          }

          const proprio = db.estabelecimentosCadastrados.find((cadastro) => cadastro.donoUserId === donoUserId);
          if (proprio) {
            if (proprio.status !== 'em_analise') {
              throw new CadastroJaProcessadoError();
            }
            // Reenvio idempotente (AC3) — atualiza a mesma linha, mesmo id.
            // Story 3.11: reenvio do wizard também re-grava o subconjunto de
            // perfil (mesmo conteúdo que a RPC real regravaria num upsert).
            proprio.cnpj = input.cnpj;
            proprio.nomeFantasia = input.nome_fantasia;
            proprio.categoria = input.categoria;
            proprio.descricao = input.descricao;
            proprio.fotoFachadaUrl = input.foto_fachada_url;
            proprio.horarios = mapHorariosCadastroParaHorario(input.horarios);
            return { id: proprio.id };
          }

          const novo = {
            id: generateMockId('estabelecimento'),
            donoUserId,
            cnpj: input.cnpj,
            status: 'em_analise' as const,
            motivoRejeicao: null,
            nomeFantasia: input.nome_fantasia,
            categoria: input.categoria,
            descricao: input.descricao,
            fotoFachadaUrl: input.foto_fachada_url,
            horarios: mapHorariosCadastroParaHorario(input.horarios),
          };
          db.estabelecimentosCadastrados.push(novo);
          return { id: novo.id };
        },
        EMPTY_RESULT,
        options,
      );
    },

    /**
     * Story 3.10 (AC2-AC6) — lê `db.estabelecimentosCadastrados` pelo
     * `donoUserId` da sessão mock atual (`db.sessionLojistaUserId`, mesmo
     * equivalente de `auth.uid()` documentado em `mock/db.ts`). `null` tanto
     * para "sem sessão" quanto para "sessão sem nenhum cadastro ainda" (AC4
     * — 0 linhas nunca é erro; paridade honesta com o adapter Supabase, que
     * também não distingue os dois casos ali — ambos resultam na mesma
     * retomada de wizard).
     */
    getMeuEstabelecimento(options?: AsyncCallOptions): Promise<MeuEstabelecimentoStatus | null> {
      return simulateAsync(
        () => {
          if (!db.sessionLojistaUserId) {
            return null;
          }
          const proprio = db.estabelecimentosCadastrados.find(
            (cadastro) => cadastro.donoUserId === db.sessionLojistaUserId,
          );
          if (!proprio) {
            return null;
          }
          return { status: proprio.status, motivo_rejeicao: proprio.motivoRejeicao };
        },
        null,
        options,
      );
    },

    /**
     * Story 3.11 (AC1, AC4). `null` tanto para "sem sessão" quanto para
     * "sessão sem nenhum cadastro ainda" — mesma paridade honesta de
     * `getMeuEstabelecimento`. Mock não tem Storage real —
     * `foto_fachada_url_assinada` reaproveita o path bruto salvo por
     * `criarCadastro` (mesma simplificação honesta documentada em
     * `admin.mock.ts#pendingStoreDetail`, Story 3.7 — não simula um endpoint
     * de assinatura que não existe neste modo).
     */
    getMeuPerfil(options?: AsyncCallOptions): Promise<MeuPerfilLojista | null> {
      return simulateAsync(
        () => {
          if (!db.sessionLojistaUserId) {
            return null;
          }
          const proprio = db.estabelecimentosCadastrados.find(
            (cadastro) => cadastro.donoUserId === db.sessionLojistaUserId,
          );
          if (!proprio) {
            return null;
          }
          return {
            nome_fantasia: proprio.nomeFantasia,
            categoria: proprio.categoria,
            descricao: proprio.descricao,
            foto_fachada_url_assinada: proprio.fotoFachadaUrl,
            horarios: proprio.horarios,
          };
        },
        null,
        options,
      );
    },

    /**
     * Story 3.11 (AC2, AC3). Só grava `categoria`/`descricao` — mesmo
     * subconjunto do `AtualizarMeuPerfilInput` real, nunca `nome_fantasia`
     * (AC2). Sem sessão ou sem cadastro próprio, rejeita honestamente (sem
     * sucesso simulado) — mesmo tipo de erro (`AutenticacaoNecessariaError`)
     * já usado pelos demais métodos desta port para "sem sessão de lojista".
     */
    atualizarMeuPerfil(input: AtualizarMeuPerfilInput, options?: AsyncCallOptions): Promise<MeuPerfilLojista> {
      return simulateAsync(
        () => {
          if (!db.sessionLojistaUserId) {
            throw new AutenticacaoNecessariaError();
          }
          const proprio = db.estabelecimentosCadastrados.find(
            (cadastro) => cadastro.donoUserId === db.sessionLojistaUserId,
          );
          if (!proprio) {
            throw new Error('[mock] atualizarMeuPerfil — nenhum estabelecimento para o dono atual.');
          }
          proprio.categoria = input.categoria;
          proprio.descricao = input.descricao;
          return {
            nome_fantasia: proprio.nomeFantasia,
            categoria: proprio.categoria,
            descricao: proprio.descricao,
            foto_fachada_url_assinada: proprio.fotoFachadaUrl,
            horarios: proprio.horarios,
          };
        },
        EMPTY_MEU_PERFIL,
        options,
      );
    },

    /**
     * Stories 4.3/4.4. `null` tanto para "sem sessão" quanto para "sessão
     * sem nenhum cadastro ainda" — mesma paridade honesta de
     * `getMeuEstabelecimento`/`getMeuPerfil`.
     */
    getMeuEstabelecimentoId(options?: AsyncCallOptions): Promise<string | null> {
      return simulateAsync(
        () => {
          if (!db.sessionLojistaUserId) {
            return null;
          }
          const proprio = db.estabelecimentosCadastrados.find(
            (cadastro) => cadastro.donoUserId === db.sessionLojistaUserId,
          );
          return proprio ? proprio.id : null;
        },
        null,
        options,
      );
    },
  };
}
