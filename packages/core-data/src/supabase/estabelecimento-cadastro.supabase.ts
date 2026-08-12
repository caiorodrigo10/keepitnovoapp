import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  AtualizarMeuPerfilInput,
  CriarEstabelecimentoInput,
  EstabelecimentoCadastroPort,
  EstabelecimentoCadastroResult,
  FachadaExt,
  FachadaUploadInput,
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
} from './estabelecimento-cadastro-errors';

/** MIME types aceitos pelo bucket `fachadas` (`allowed_mime_types`, migration `20260812123049`). */
const CONTENT_TYPE_BY_EXT: Record<FachadaExt, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Story 3.11 (AC4) — mesmo bucket/janela de expiração já usados em
 * `admin.supabase.ts#pendingStoreDetail` (Story 3.7, `05-security.md §6.7`).
 * Constantes redeclaradas aqui (não importadas de `admin.supabase.ts`, que
 * não as exporta) — mesmo valor, sem acoplar esta port de escrita do
 * lojista à port administrativa.
 */
const FACHADAS_BUCKET = 'fachadas';
const FOTO_FACHADA_SIGNED_URL_EXPIRES_IN_SECONDS = 300;

type EstabelecimentoPerfilRow = {
  id: string;
  nome_fantasia: string;
  categoria: string;
  descricao: string | null;
  foto_fachada_url: string | null;
};

type EstabelecimentoHorarioRow = {
  dia_semana: number;
  aberto: boolean;
  hora_abre: string | null;
  hora_fecha: string | null;
};

/**
 * Story 3.11 (AC1, AC4). Reaproveitada por `getMeuPerfil` e
 * `atualizarMeuPerfil` (após a escrita, relê a linha para devolver o estado
 * real persistido — nunca inventa o retorno a partir do input recebido,
 * mesmo padrão de `fetchEstabelecimentoAposMutacao` em `admin.supabase.ts`).
 * `null` = nenhuma linha para `donoUserId` (0 linhas — honesto, nunca erro).
 * Falha ao assinar a foto degrada para `null` sem derrubar o restante (AC4,
 * mesmo padrão REL-001 da Story 3.7).
 */
async function fetchMeuPerfilPorDono(
  supabase: SupabaseClient<Database>,
  donoUserId: string,
): Promise<MeuPerfilLojista | null> {
  const { data, error } = await supabase
    .from('estabelecimentos')
    .select('id, nome_fantasia, categoria, descricao, foto_fachada_url')
    .eq('dono_user_id', donoUserId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  const row = data as unknown as EstabelecimentoPerfilRow;

  const { data: horariosData, error: horariosError } = await supabase
    .from('estabelecimentos_horarios')
    .select('dia_semana, aberto, hora_abre, hora_fecha')
    .eq('estabelecimento_id', row.id);
  if (horariosError) {
    throw horariosError;
  }
  const horarios: EstabelecimentoHorario[] = ((horariosData ?? []) as unknown as EstabelecimentoHorarioRow[])
    .slice()
    .sort((a, b) => a.dia_semana - b.dia_semana)
    .map((h) => ({ dia_semana: h.dia_semana, aberto: h.aberto, hora_abre: h.hora_abre, hora_fecha: h.hora_fecha }));

  let fotoFachadaUrlAssinada: string | null = null;
  if (row.foto_fachada_url) {
    try {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(FACHADAS_BUCKET)
        .createSignedUrl(row.foto_fachada_url, FOTO_FACHADA_SIGNED_URL_EXPIRES_IN_SECONDS);
      fotoFachadaUrlAssinada = signedUrlError ? null : (signedUrlData?.signedUrl ?? null);
    } catch {
      // [AC4] Falha ao assinar a foto (RLS de storage, rede, etc.) nunca
      // derruba a leitura do restante do perfil — degrada para `null`.
      fotoFachadaUrlAssinada = null;
    }
  }

  return {
    nome_fantasia: row.nome_fantasia,
    categoria: row.categoria,
    descricao: row.descricao,
    foto_fachada_url_assinada: fotoFachadaUrlAssinada,
    horarios,
  };
}

/**
 * Adapter Supabase de `EstabelecimentoCadastroPort` — Story 3.5 (AC2, AC3, AC4).
 *
 * [IDS] REUSE do padrão `resolveClient()` lazy/memoizado já usado em
 * `lojista-auth.supabase.ts`/`auth.supabase.ts` — `client` opcional, sem
 * exigir env vars fora de quem realmente chama os métodos.
 */
export function createEstabelecimentoCadastroSupabase(
  client?: SupabaseClient<Database>,
): EstabelecimentoCadastroPort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    /**
     * AC2. Lê o usuário autenticado (necessário para montar o path
     * `${uid}/fachada.<ext>` exigido pelas policies de Storage — ver JSDoc
     * da port), converte `input.uri` num `Blob` via `fetch` (idioma padrão
     * de upload de arquivo local em React Native/Expo para o SDK do
     * Supabase Storage — não depende de `expo-file-system`, que não está
     * instalado neste workspace) e envia com `upsert: true` (troca de foto
     * reenvia para o MESMO path, sem acumular lixo no bucket).
     *
     * `input.uri` NUNCA deve ser o marcador `'local-placeholder'` (ver JSDoc
     * de `FachadaUploadInput` — quem chama filtra isso antes).
     */
    async uploadFachada(input: FachadaUploadInput, _options?: AsyncCallOptions): Promise<string> {
      const supabase = resolveClient();

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new AutenticacaoNecessariaError();
      }

      const response = await fetch(input.uri);
      const blob = await response.blob();
      const path = `${userData.user.id}/fachada.${input.ext}`;

      const { error: uploadError } = await supabase.storage.from('fachadas').upload(path, blob, {
        contentType: CONTENT_TYPE_BY_EXT[input.ext],
        upsert: true,
      });
      if (uploadError) {
        throw uploadError;
      }

      return path;
    },

    /**
     * AC3/AC4. Chama `criar_estabelecimento_completo` (migration
     * `20260812123048`) e traduz os 4 erros nomeados (`RAISE EXCEPTION`) em
     * classes dedicadas — `.includes()` no texto de `error.message` (a
     * exceção customizada de PL/pgSQL não carrega um SQLSTATE específico,
     * cai no genérico `P0001`; o texto do `RAISE` é o único sinal
     * disponível). Qualquer outro erro (rede, RLS, violação de CHECK dos
     * horários, etc.) é propagado tal como recebido, sem sucesso fictício
     * (AC4). `data` é o `uuid` do estabelecimento (tipado como `string` —
     * ver reconciliação manual em `@keepit/shared-types`).
     */
    async criarCadastro(
      input: CriarEstabelecimentoInput,
      _options?: AsyncCallOptions,
    ): Promise<EstabelecimentoCadastroResult> {
      const supabase = resolveClient();

      const { data, error } = await supabase.rpc('criar_estabelecimento_completo', {
        p_nome_fantasia: input.nome_fantasia,
        p_cnpj: input.cnpj,
        p_responsavel_nome: input.responsavel_nome,
        p_telefone: input.telefone,
        p_categoria: input.categoria,
        p_endereco: input.endereco,
        p_lat: input.lat,
        p_lng: input.lng,
        p_raio_atendimento_km: input.raio_atendimento_km,
        p_tempo_medio_entrega_min: input.tempo_medio_entrega_min,
        p_taxa_deslocamento_reais: input.taxa_deslocamento_reais,
        p_ticket_minimo_reais: input.ticket_minimo_reais,
        p_chave_pix: input.chave_pix,
        p_chave_pix_tipo: input.chave_pix_tipo,
        p_foto_fachada_url: input.foto_fachada_url,
        p_descricao: input.descricao,
        // `HorarioCadastroInput[]` é estruturalmente um JSON válido (só
        // `number`/`boolean`/`string`), mas não carrega um index signature
        // explícito — cast documentado, não um `any` às cegas.
        p_horarios: input.horarios as unknown as Json,
      });

      if (error) {
        const message = error.message ?? '';
        if (message.includes('AUTENTICACAO_NECESSARIA')) throw new AutenticacaoNecessariaError();
        if (message.includes('HORARIOS_INVALIDOS')) throw new HorariosInvalidosError();
        if (message.includes('CADASTRO_JA_PROCESSADO')) throw new CadastroJaProcessadoError();
        if (message.includes('CNPJ_DUPLICADO')) throw new CnpjDuplicadoError();
        throw error;
      }

      if (!data) {
        throw new Error('[core-data/supabase] criar_estabelecimento_completo — RPC retornou vazio sem erro.');
      }

      return { id: data };
    },

    /**
     * Story 3.10 (AC2-AC6). Lê a própria linha de `estabelecimentos` sob a
     * RLS `publico_ve_ativos` (Story 3.5, `dono_user_id = auth.uid()`, sem
     * filtro de status — cobre `em_analise`/`ativo`/`rejeitado`/`suspenso`
     * igualmente). `.eq('dono_user_id', user.id)` é necessário: sem esse
     * filtro, a mesma policy também libera leitura pública de QUALQUER loja
     * `status = 'ativo'` — sem filtrar por dono, um `SELECT` "solto" poderia
     * devolver a loja `ativo` de OUTRO lojista, não a própria (AC6 — a rota
     * depende só do estado REAL do PRÓPRIO estabelecimento). `.maybeSingle()`
     * porque 0 linhas é um resultado válido (AC4 — nunca lançado como erro);
     * qualquer outro erro (rede, RLS negando por falta de sessão) propaga
     * tal como recebido.
     */
    async getMeuEstabelecimento(_options?: AsyncCallOptions): Promise<MeuEstabelecimentoStatus | null> {
      const supabase = resolveClient();

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      const user = userData.user;
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('estabelecimentos')
        .select('status, motivo_rejeicao')
        .eq('dono_user_id', user.id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }

      // `status` é `text` no banco (sem enum PostgreSQL) — mesmo cast
      // documentado em `admin.supabase.ts` (Story 3.7).
      return { status: data.status as MeuEstabelecimentoStatus['status'], motivo_rejeicao: data.motivo_rejeicao };
    },

    /**
     * Story 3.11 (AC1, AC4). Mesmo filtro explícito `.eq('dono_user_id',
     * user.id)` de `getMeuEstabelecimento` (AC6 daquela Story) — sem sessão,
     * `null` honesto sem consultar a tabela.
     */
    async getMeuPerfil(_options?: AsyncCallOptions): Promise<MeuPerfilLojista | null> {
      const supabase = resolveClient();

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      const user = userData.user;
      if (!user) {
        return null;
      }

      return fetchMeuPerfilPorDono(supabase, user.id);
    },

    /**
     * Story 3.11 (AC2, AC3). `UPDATE` restrito a `categoria`/`descricao` —
     * `nome_fantasia`/`cnpj`/`status` NUNCA entram no payload (AC2), mesmo
     * que a RLS `lojista_atualiza_proprio`/o trigger de imutabilidade não
     * bloqueiem `nome_fantasia` especificamente (defesa em profundidade na
     * camada de app). `.eq('dono_user_id', user.id)` filtra a escrita à
     * própria linha (mesma razão de `getMeuEstabelecimento`/AC6 da Story
     * 3.10 — sem esse filtro, um `UPDATE` "solto" dependeria só da RLS).
     * Após o sucesso, relê a linha real (`fetchMeuPerfilPorDono`) em vez de
     * ecoar o input de volta — nunca um sucesso simulado.
     */
    async atualizarMeuPerfil(
      input: AtualizarMeuPerfilInput,
      _options?: AsyncCallOptions,
    ): Promise<MeuPerfilLojista> {
      const supabase = resolveClient();

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      const user = userData.user;
      if (!user) {
        throw new AutenticacaoNecessariaError();
      }

      const { error } = await supabase
        .from('estabelecimentos')
        .update({ categoria: input.categoria, descricao: input.descricao })
        .eq('dono_user_id', user.id);
      if (error) {
        throw error;
      }

      const perfil = await fetchMeuPerfilPorDono(supabase, user.id);
      if (!perfil) {
        throw new Error(
          '[core-data/supabase] atualizarMeuPerfil — UPDATE concluiu com sucesso mas a releitura não encontrou a linha (inesperado).',
        );
      }
      return perfil;
    },

    /**
     * Stories 4.3/4.4 (Dependencies) — mesmo filtro explícito
     * `.eq('dono_user_id', user.id)` de `getMeuEstabelecimento`/`getMeuPerfil`
     * (AC6 da Story 3.10) — sem sessão, `null` honesto sem consultar a
     * tabela. `.maybeSingle()` porque "sem cadastro ainda" é um resultado
     * válido (nunca lançado como erro).
     */
    async getMeuEstabelecimentoId(_options?: AsyncCallOptions): Promise<string | null> {
      const supabase = resolveClient();

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      const user = userData.user;
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('estabelecimentos')
        .select('id')
        .eq('dono_user_id', user.id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data ? data.id : null;
    },
  };
}
