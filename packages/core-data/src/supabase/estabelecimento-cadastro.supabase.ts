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
 * `null` = nenhuma loja vinculada ao usuário autenticado.
 * Falha ao assinar a foto degrada para `null` sem derrubar o restante (AC4,
 * mesmo padrão REL-001 da Story 3.7).
 */
async function fetchMeuPerfilAutorizado(
  supabase: SupabaseClient<Database>,
): Promise<MeuPerfilLojista | null> {
  const { data: privateRows, error } = await supabase.rpc('obter_meu_estabelecimento_privado');
  const data = privateRows?.[0] ?? null;
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

    /** Lê o status da loja do usuário pela RPC que valida auth.uid() no banco. */
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
        .rpc('obter_meu_estabelecimento_privado');
      if (error) {
        throw error;
      }
      const row = data?.[0];
      if (!row) {
        return null;
      }

      // `status` é `text` no banco (sem enum PostgreSQL) — mesmo cast
      // documentado em `admin.supabase.ts` (Story 3.7).
      return { status: row.status as MeuEstabelecimentoStatus['status'], motivo_rejeicao: row.motivo_rejeicao };
    },

    /** Lê o perfil autorizado do lojista; sem sessão resolve null. */
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

      return fetchMeuPerfilAutorizado(supabase);
    },

    /** Atualiza por id obtido da RPC privada e relê o perfil persistido. */
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

      const { data: minhasLojas, error: leituraError } = await supabase.rpc('obter_meu_estabelecimento_privado');
      if (leituraError) {
        throw leituraError;
      }
      const estabelecimentoId = minhasLojas?.[0]?.id;
      if (!estabelecimentoId) {
        throw new Error('[core-data/supabase] atualizarMeuPerfil — estabelecimento do usuário não encontrado.');
      }
      const { error } = await supabase
        .from('estabelecimentos')
        .update({ categoria: input.categoria, descricao: input.descricao })
        .eq('id', estabelecimentoId);
      if (error) {
        throw error;
      }

      const perfil = await fetchMeuPerfilAutorizado(supabase);
      if (!perfil) {
        throw new Error(
          '[core-data/supabase] atualizarMeuPerfil — UPDATE concluiu com sucesso mas a releitura não encontrou a linha (inesperado).',
        );
      }
      return perfil;
    },

    /** Obtém o id da loja do usuário pela RPC privada. */
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
        .rpc('obter_meu_estabelecimento_privado');
      if (error) {
        throw error;
      }
      return data?.[0]?.id ?? null;
    },
  };
}
