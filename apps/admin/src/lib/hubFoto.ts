import type { HubFotoExt } from '@keepit/core-data';

import { getAdminDataClient } from './adminClient';

/**
 * Upload de foto de hub — Story 4.1 (AC2, AC6). Local ao app Admin, NÃO uma
 * port dedicada: [IDS] REUSE de `AdminPort.hubsCrud.uploadFoto` (já
 * existente em `packages/core-data`), este módulo só resolve a diferença de
 * origem específica do Admin web (`<input type="file">`, `File` do DOM) para
 * o contrato `{ uri, ext }` que a port espera — mesma forma que
 * `CadastroPasso3.tsx` (apps/lojista) resolveria a partir de
 * `expo-image-picker`, mas aqui via `URL.createObjectURL(file)` (Next.js
 * roda no browser, sem `expo-file-system`).
 */

/** Mesma allowlist de MIME do bucket `hubs` (`allowed_mime_types`, migration `20260812164200`). */
export const HUB_FOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Limite de 5MB do bucket `hubs` (`docs/architecture/05-security.md §6.7`). */
export const HUB_FOTO_MAX_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, HubFotoExt> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Validação client-side de MIME/tamanho (AC2) — ANTES de qualquer upload.
 * `null` = arquivo válido; string = mensagem de erro para exibir na UI.
 */
export function validarFotoHub(file: File): string | null {
  if (!HUB_FOTO_MIME_TYPES.includes(file.type as (typeof HUB_FOTO_MIME_TYPES)[number])) {
    return 'Formato inválido — envie um arquivo JPG, PNG ou WEBP.';
  }
  if (file.size > HUB_FOTO_MAX_BYTES) {
    return 'Arquivo muito grande — o limite é 5MB.';
  }
  return null;
}

/**
 * Faz o upload de `file` para o bucket público `hubs` via
 * `AdminPort.hubsCrud.uploadFoto` e devolve a URL pública direta (AC6) —
 * chamador é responsável por já ter validado o arquivo com `validarFotoHub`
 * (mesma separação de responsabilidade da Story 3.5, `CadastroPasso3.tsx`
 * filtrando antes de invocar `uploadFachada`).
 */
export async function uploadFotoHub(file: File): Promise<string> {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) {
    throw new Error(`[admin] uploadFotoHub — MIME não suportado: ${file.type}`);
  }
  const uri = URL.createObjectURL(file);
  const url = await getAdminDataClient().admin.hubsCrud.uploadFoto({ uri, ext });
  // Só revoga a Blob URL local se o adapter devolveu uma URL DIFERENTE
  // (bucket público real, Story 4.1 AC6) — em modo mock (sem Storage de
  // verdade), `uploadFoto` ecoa a MESMA `uri` de volta (ver JSDoc de
  // `admin.mock.ts#hubsCrud.uploadFoto`), e revogá-la quebraria o preview
  // que a UI acabou de gravar como `foto_url`.
  if (url !== uri) {
    URL.revokeObjectURL(uri);
  }
  return url;
}
