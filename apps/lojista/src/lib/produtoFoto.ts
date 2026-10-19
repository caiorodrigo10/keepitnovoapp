/**
 * Upload de foto de produto — Story 4.4 (AC4, AC5).
 *
 * [IDS] CREATE — seam honesto e testável, NÃO wired a nenhuma UI nesta
 * sessão: `ProductForm.tsx` desliga a interação de foto em
 * `DATA_SOURCE=supabase` (`fotoUploadEnabled={false}`, `CadastrarProduto.tsx`)
 * porque nenhuma lib de seleção de imagem (`expo-image-picker`) está
 * instalada neste workspace (mesmo gap já registrado nas Stories 3.1/3.5,
 * "Não caber `pnpm install` de nova dependência nativa no escopo de uma
 * sessão autônoma de @dev"). Este módulo existe para que o contrato de
 * validação/upload já exista, testado, pronto para ser chamado assim que um
 * picker real estiver disponível (produzindo `{ uri, mimeType, sizeBytes }`
 * de um arquivo de verdade) — mesmo espírito de `resolveFachadaUploadInput`
 * (`cadastroPasso3Submit.ts`, Story 3.5).
 *
 * [IDS] ADAPT do padrão `validarFotoHub`/`HUB_FOTO_MAX_BYTES`
 * (`apps/admin/src/lib/hubFoto.ts`, Story 4.1) — mesma allowlist de MIME e
 * limite de 5MB do bucket `produtos` (`allowed_mime_types`/`file_size_limit`,
 * migration `20260812190002_storage_bucket_produtos.sql`). Assinatura
 * diferente de `hubFoto.ts` (`{ mimeType, sizeBytes }`, não `File` do DOM) —
 * `apps/lojista` roda em React Native, que não tem o global `File` do
 * browser (diferente de `apps/admin`, Next.js/web).
 */

import type { ProdutoFotoExt } from '@keepit/core-data';
import { getDataClient } from '@keepit/core-data';

/** Mesma allowlist de MIME do bucket `produtos` (`allowed_mime_types`, migration `20260812190002`). */
export const PRODUTO_FOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Limite de 5MB do bucket `produtos` (`docs/architecture/05-security.md §6.7`). */
export const PRODUTO_FOTO_MAX_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, ProdutoFotoExt> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface ProdutoFotoArquivo {
  uri: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Validação client-side de MIME/tamanho (AC5) — ANTES de qualquer upload.
 * `null` = arquivo válido; string = mensagem de erro para exibir na UI.
 */
export function validarFotoProduto(arquivo: Pick<ProdutoFotoArquivo, 'mimeType' | 'sizeBytes'>): string | null {
  if (!PRODUTO_FOTO_MIME_TYPES.includes(arquivo.mimeType as (typeof PRODUTO_FOTO_MIME_TYPES)[number])) {
    return 'Formato inválido — envie uma imagem JPG, PNG ou WEBP.';
  }
  if (arquivo.sizeBytes > PRODUTO_FOTO_MAX_BYTES) {
    return 'Arquivo muito grande — o limite é 5MB.';
  }
  return null;
}

/**
 * Valida e faz o upload de `arquivo` para o bucket público `produtos` via
 * `ProductPort.uploadFoto`, devolvendo a URL pública direta (AC4). Rejeita
 * ANTES de chamar a port se a validação falhar (AC5 — nunca envia um
 * arquivo inválido para o Storage).
 */
export async function uploadFotoProduto(arquivo: ProdutoFotoArquivo): Promise<string> {
  const erro = validarFotoProduto(arquivo);
  if (erro) {
    throw new Error(erro);
  }
  const ext = EXT_BY_MIME[arquivo.mimeType];
  if (!ext) {
    throw new Error(`[lojista] uploadFotoProduto — MIME não suportado: ${arquivo.mimeType}`);
  }
  return getDataClient().product.uploadFoto({ uri: arquivo.uri, ext });
}
