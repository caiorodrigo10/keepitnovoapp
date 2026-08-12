import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type {
  CreateProdutoInput,
  ProdutoFotoExt,
  ProdutoFotoUploadInput,
  Produto,
  ProductPort,
  UpdateProdutoInput,
} from '../ports/product.port';
import type { AsyncCallOptions } from '../types';

/** Bucket PÚBLICO `produtos` (`docs/architecture/05-security.md §6.7`, migration `20260812190002`). */
const PRODUTOS_BUCKET = 'produtos';

/** MIME types aceitos pelo bucket `produtos` (`allowed_mime_types`, migration `20260812190002`). */
const CONTENT_TYPE_BY_EXT: Record<ProdutoFotoExt, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const PRODUTO_COLUMNS =
  'id, estabelecimento_id, nome, descricao, preco_reais, categoria_produto, foto_url, ativo, excluido_em';

/**
 * Story 4.5 (AC1)/4.6 (AC1, AC2). Releitura por `id` — usada por `getById`
 * diretamente e por `update`/`pause`/`delete` depois da escrita (mesmo
 * padrão "nunca ecoar o input, sempre reler o estado real persistido" de
 * `admin.supabase.ts#fetchHubById`, Story 4.1). `.maybeSingle()` — `null`
 * honesto quando o `id` não existe ou quando a RLS `lojista_gerencia_produtos`
 * bloqueia (produto de outro dono), indistinguível por design.
 */
async function fetchProdutoById(supabase: SupabaseClient<Database>, id: string): Promise<Produto | null> {
  const { data, error } = await supabase.from('produtos').select(PRODUTO_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    throw error;
  }
  return (data as unknown as Produto | null) ?? null;
}

/**
 * Story 4.5 (AC2)/4.6 (AC1, AC2, AC4). `UPDATE` parcial (só as colunas
 * presentes em `patch`) seguido de releitura via `fetchProdutoById` — nunca
 * ecoa o `patch`/input de volta. Reaproveitado por `update` (patch derivado
 * de `UpdateProdutoInput`), `pause` (`{ ativo: false }`) e `delete`
 * (`{ excluido_em: NOW() }`, exceto que `delete` não precisa da releitura
 * porque a port devolve `void`). A RLS `lojista_gerencia_produtos` é a
 * barreira real: um `UPDATE` sobre um `id` de outro dono afeta 0 linhas
 * (sem erro do Postgres) — a releitura devolve `null`/lança abaixo, nunca um
 * sucesso fictício.
 */
async function applyProdutoPatch(
  supabase: SupabaseClient<Database>,
  id: string,
  patch: Database['public']['Tables']['produtos']['Update'],
): Promise<Produto> {
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('produtos').update(patch).eq('id', id);
    if (error) {
      throw error;
    }
  }

  const updated = await fetchProdutoById(supabase, id);
  if (!updated) {
    throw new Error(
      '[core-data/supabase] product — UPDATE concluiu com sucesso mas a releitura não encontrou o produto (RLS bloqueando produto de outro dono, ou id inexistente).',
    );
  }
  return updated;
}

/**
 * Adapter Supabase de `ProductPort` — Stories 4.3 (`list`), 4.4 (`create`,
 * `uploadFoto`), 4.5 (`getById`, `update`) e 4.6 (`pause`, `delete`).
 */
export function createProductSupabase(client?: SupabaseClient<Database>): ProductPort {
  let cachedClient: SupabaseClient<Database> | null = client ?? null;
  const resolveClient = (): SupabaseClient<Database> => cachedClient ?? (cachedClient = createClient());

  return {
    /**
     * Story 4.3 (AC1, AC2, AC6). `estabelecimento_id` é sempre um filtro
     * explícito (não confiado só à RLS) — `lojista_gerencia_produtos`
     * garante que o lojista só enxerga linhas do PRÓPRIO estabelecimento
     * mesmo que este `estabelecimentoId` seja manipulado no client (AC6, a
     * barreira real é o Postgres). `excluido_em IS NULL` sempre aplicado;
     * `ativo = true` só quando `incluirInativos` não é `true` — mesmo
     * contrato exato do mock (`product.mock.ts#list`, Story 1.10, Task 5).
     */
    async list(
      estabelecimentoId: string,
      options?: AsyncCallOptions & { incluirInativos?: boolean },
    ): Promise<Produto[]> {
      const supabase = resolveClient();

      let query = supabase
        .from('produtos')
        .select(PRODUTO_COLUMNS)
        .eq('estabelecimento_id', estabelecimentoId)
        .is('excluido_em', null);
      if (!options?.incluirInativos) {
        query = query.eq('ativo', true);
      }

      const { data, error } = await query.order('nome', { ascending: true });
      if (error) {
        throw error;
      }
      return (data ?? []) as unknown as Produto[];
    },

    /**
     * Story 4.5 (AC1). Releitura direta por `id` — `null` honesto quando o
     * produto não existe ou pertence a outro dono (RLS `lojista_gerencia_produtos`
     * bloqueia a linha silenciosamente, mesmo comportamento de `hub.getById`).
     */
    async getById(id: string, _options?: AsyncCallOptions): Promise<Produto | null> {
      return fetchProdutoById(resolveClient(), id);
    },

    /**
     * Story 4.4 (AC2, AC3, AC6). `INSERT` sob `lojista_gerencia_produtos` —
     * um `estabelecimento_id` que não pertence ao `dono_user_id = auth.uid()`
     * do lojista autenticado é rejeitado pela RLS (`WITH CHECK`), não
     * apenas pela UI (AC3). Nunca resolve com sucesso simulado: qualquer
     * falha (rede, RLS, `CHECK preco_reais > 0`) rejeita a Promise — a linha
     * devolvida é a REAL persistida pelo `INSERT ... RETURNING`, nunca um
     * eco do input.
     */
    async create(input: CreateProdutoInput, _options?: AsyncCallOptions): Promise<Produto> {
      const supabase = resolveClient();

      const { data, error } = await supabase
        .from('produtos')
        .insert({
          estabelecimento_id: input.estabelecimento_id,
          nome: input.nome,
          descricao: input.descricao ?? null,
          preco_reais: input.preco_reais,
          categoria_produto: input.categoria_produto,
          foto_url: input.foto_url ?? null,
        })
        .select(PRODUTO_COLUMNS)
        .single();
      if (error) {
        throw error;
      }
      return data as unknown as Produto;
    },

    /**
     * Story 4.5 (AC2, AC3). Patch parcial — só os campos presentes em
     * `input` (não exige reenvio de todos os campos, AC2). `UPDATE` sob
     * `lojista_gerencia_produtos`: um `id` de produto cujo
     * `estabelecimento_id` não pertence ao `auth.uid()` do lojista afeta 0
     * linhas (RLS `USING`), e a releitura em `applyProdutoPatch` lança em vez
     * de devolver sucesso fictício (AC3). Sempre relê o produto pós-escrita
     * (nunca ecoa o `input`).
     */
    async update(id: string, input: UpdateProdutoInput, _options?: AsyncCallOptions): Promise<Produto> {
      const supabase = resolveClient();

      const patch: Database['public']['Tables']['produtos']['Update'] = {};
      if (input.nome !== undefined) patch.nome = input.nome;
      if (input.descricao !== undefined) patch.descricao = input.descricao;
      if (input.preco_reais !== undefined) patch.preco_reais = input.preco_reais;
      if (input.categoria_produto !== undefined) patch.categoria_produto = input.categoria_produto;
      if (input.foto_url !== undefined) patch.foto_url = input.foto_url;
      if (input.ativo !== undefined) patch.ativo = input.ativo;

      return applyProdutoPatch(supabase, id, patch);
    },

    /**
     * Story 4.6 (AC1, AC4). `UPDATE ativo = false` real — reversível via
     * `update(id, { ativo: true })` (mesmo contrato do mock, Story 1.10).
     * Mesma barreira de RLS de `update`.
     */
    async pause(id: string, _options?: AsyncCallOptions): Promise<Produto> {
      return applyProdutoPatch(resolveClient(), id, { ativo: false });
    },

    /**
     * Story 4.6 (AC2, AC4). Soft delete real — `UPDATE excluido_em = NOW()`,
     * NUNCA `DELETE` físico da linha (mesmo padrão de
     * `estabelecimentos`/`clientes`, `docs/architecture/03-data-models.md`).
     * **Limitação de escopo registrada explicitamente (não simulada):** a
     * checagem "não permitido se há pedidos em aberto" do texto literal do
     * Épico NÃO é implementada aqui — a tabela `pedidos` não existe neste
     * ponto da execução do piloto (Épico 6 vem depois de 4.x/5.x,
     * `docs/prd/07-plano-mvp-piloto.md`). A exclusão procede
     * incondicionalmente, restrita apenas pela RLS `lojista_gerencia_produtos`
     * (dono do produto). Débito de retomada: adicionar a checagem real
     * quando `pedidos` existir (Épico 6).
     */
    async delete(id: string, _options?: AsyncCallOptions): Promise<void> {
      const supabase = resolveClient();
      const { error } = await supabase
        .from('produtos')
        .update({ excluido_em: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        throw error;
      }
    },

    /**
     * Story 4.4 (AC4). Path `${uid}/<arquivo>` (convenção fixada pela
     * migration `20260812190002_storage_bucket_produtos.sql` — a policy
     * `produtos_dono_insere` só permite gravar sob a própria pasta do uid).
     * `<arquivo>` é gerado aqui (não recebido do chamador) — diferente de
     * `uploadFachada`/`hubsCrud.uploadFoto` (1 foto fixa por dono), um
     * lojista tem VÁRIOS produtos, então cada upload precisa de um nome
     * próprio para não colidir/sobrescrever a foto de outro produto.
     * Retorna a URL PÚBLICA direta do objeto (nunca assinada — bucket
     * público, mesmo padrão de `hubsCrud.uploadFoto`).
     */
    async uploadFoto(input: ProdutoFotoUploadInput, _options?: AsyncCallOptions): Promise<string> {
      const supabase = resolveClient();

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      if (!userData.user) {
        throw new Error('[core-data/supabase] product.uploadFoto — autenticação necessária.');
      }

      const response = await fetch(input.uri);
      const blob = await response.blob();
      const arquivo = `produto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${input.ext}`;
      const path = `${userData.user.id}/${arquivo}`;

      const { error: uploadError } = await supabase.storage.from(PRODUTOS_BUCKET).upload(path, blob, {
        contentType: CONTENT_TYPE_BY_EXT[input.ext],
        upsert: true,
      });
      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from(PRODUTOS_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    },
  };
}
