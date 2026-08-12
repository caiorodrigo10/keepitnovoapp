/**
 * Lógica pura do submit do Cadastro passo 3 (recebimento + fachada +
 * horários) — Story 3.5 (AC2, AC3, AC4).
 *
 * [IDS] CREATE — mesmo padrão local-por-story de `./cadastroPasso2Validation.ts`
 * (Story 3.4) e `./cnpj.ts` (Story 3.3): funções puras, síncronas, sem
 * dependência de React Native nem de `@keepit/core-data` runtime (só tipos),
 * testáveis isoladamente via `vitest`.
 */

import {
  AutenticacaoNecessariaError,
  CadastroJaProcessadoError,
  CnpjDuplicadoError,
  HorariosInvalidosError,
  type FachadaExt,
  type FachadaUploadInput,
  type HorarioCadastroInput,
} from '@keepit/core-data';

import type { HorarioDraft } from '../screens/auth/cadastroDraft';

/**
 * Marcador herdado da Story 0.8 (`CadastroPasso3.tsx`/`CadastroPasso1.tsx`) —
 * NUNCA um URI de arquivo de verdade. Ver `resolveFachadaUploadInput` abaixo.
 */
export const FACHADA_PLACEHOLDER_URI = 'local-placeholder';

/**
 * Converte os 7 `HorarioDraft` do `CadastroDraftContext` para o shape que a
 * RPC `criar_estabelecimento_completo` espera (AC3): quando `aberto = false`,
 * `hora_abre`/`hora_fecha` são forçados para `''` (a RPC os converte para
 * `NULL` via `NULLIF`, migration `20260812123048`) — mesmo se o lojista
 * tiver digitado algo antes de desmarcar "aberto" (a UI, Story 0.8, não
 * limpa os campos de hora ao desmarcar o switch).
 */
export function buildHorariosPayload(horarios: HorarioDraft[]): HorarioCadastroInput[] {
  return horarios.map((horario) => ({
    dia_semana: horario.dia_semana,
    aberto: horario.aberto,
    hora_abre: horario.aberto ? horario.hora_abre : '',
    hora_fecha: horario.aberto ? horario.hora_fecha : '',
  }));
}

const KNOWN_EXTS: FachadaExt[] = ['jpg', 'jpeg', 'png', 'webp'];

/** Extensão inferida do URI; desconhecida/ausente cai no fallback `'jpg'` (MIME mais comum de câmera). */
function inferExtFromUri(uri: string): FachadaExt {
  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(uri);
  const raw = match?.[1]?.toLowerCase();
  return (KNOWN_EXTS as string[]).includes(raw ?? '') ? (raw as FachadaExt) : 'jpg';
}

/**
 * Story 3.5 (AC2) — [AUTO-DECISION]. `draft.foto_fachada_url` (Story 0.8) só
 * assume dois valores nesta versão da UI: `null` (sem foto) ou o marcador
 * `FACHADA_PLACEHOLDER_URI` (placeholder — "Adicionar imagem" tocado, sem
 * nenhum arquivo real por trás: este workspace não instala
 * `expo-image-picker`, mesma decisão já registrada em
 * `ProductForm.tsx`/`CadastroPasso1.tsx`, fora do escopo desta Story
 * reintroduzir). Retorna `null` para os dois casos — nunca envia o
 * placeholder para `EstabelecimentoCadastroPort.uploadFachada` (que exige um
 * URI de arquivo de verdade). Isso mantém a AC2 honesta: sem um arquivo
 * real, `foto_fachada_url` fica `null`, nunca um upload fingido. Quando uma
 * Story futura substituir o placeholder por um picker real (produzindo um
 * URI `file://...`/`content://...`), esta função já reconhece qualquer URI
 * que não seja o marcador como "real" — nenhuma mudança adicional necessária
 * aqui.
 */
export function resolveFachadaUploadInput(fotoFachadaUrl: string | null): FachadaUploadInput | null {
  if (!fotoFachadaUrl || fotoFachadaUrl === FACHADA_PLACEHOLDER_URI) {
    return null;
  }
  return { uri: fotoFachadaUrl, ext: inferExtFromUri(fotoFachadaUrl) };
}

/**
 * Story 3.5 (AC4). Mensagens honestas por tipo de erro — sem fonte no
 * protótipo/épico (texto novo em pt-BR, mesmo padrão da Story 3.2/3.3 para
 * mensagens sem referência visual). Qualquer erro não reconhecido (rede,
 * RLS, violação de CHECK dos horários, etc.) cai na mensagem genérica — a UI
 * não distingue esses casos entre si (mesma decisão anti-detalhe da Story
 * 2.6/3.2 para não vazar causa técnica ao lojista).
 */
export function mapCadastroErrorToMessage(error: unknown): string {
  if (error instanceof CnpjDuplicadoError) {
    return 'Este CNPJ já está cadastrado. Se acha que é um engano, fale com a Keepit.';
  }
  if (error instanceof CadastroJaProcessadoError) {
    return 'Seu cadastro já foi analisado — não é possível reenviar o Passo 3.';
  }
  if (error instanceof AutenticacaoNecessariaError) {
    return 'Sua sessão expirou. Saia e entre novamente para reenviar o cadastro.';
  }
  if (error instanceof HorariosInvalidosError) {
    return 'Não foi possível salvar os horários. Confira os dias marcados como "aberto" e tente novamente.';
  }
  return 'Não foi possível enviar seu cadastro agora. Tente novamente em instantes.';
}
