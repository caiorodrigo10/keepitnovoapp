// GERADO AUTOMATICAMENTE — Story 1.4 (Épico 1).
// Origem: `supabase gen types` do projeto keepit-dev (ref jhhbewnmnorhmsdvfppo),
// executado via MCP do Supabase em 2026-07-29.
// NÃO editar à mão — regenerar quando o schema mudar.
//
// Story 2.8 (2026-08-12) — reconciliação manual da tabela `clientes`: este
// arquivo não foi regenerado desde 2026-07-29, mas a migration
// `apps/supabase/supabase/migrations/20260731143000_criar_clientes.sql`
// (Story 2.3, aplicada em 2026-07-31 ao projeto keepit-dev) criou a tabela
// no banco real sem que os tipos fossem atualizados — confirmado por sonda
// real via REST (`GET /rest/v1/clientes?select=*&limit=0` → 200 `[]`, sem
// `SUPABASE_ACCESS_TOKEN` disponível neste ambiente para rodar
// `supabase gen types` via CLI/login). A entrada `clientes` abaixo espelha
// exatamente o DDL aplicado (5 colunas do subconjunto mínimo: `id, nome,
// telefone, cpf, criado_em` — ver o cabeçalho da migration, "ESCOPO (delta
// desta story)"), não inventa nenhuma coluna do modelo-alvo de
// `docs/architecture/03-data-models.md` §1.1 que ainda não foi migrada.
//
// Story 3.5 (2026-08-12) — reconciliação manual adicional, mesmo padrão da
// Story 2.8: a RPC `public.criar_estabelecimento_completo` foi aplicada ao
// `keepit-dev` pela migration
// `apps/supabase/supabase/migrations/20260812123048_rpc_criar_estabelecimento_completo.sql`
// (@data-engineer) sem regeneração de tipos (mesma limitação de ambiente —
// sem `SUPABASE_ACCESS_TOKEN`/login para `supabase gen types`). A entrada
// `criar_estabelecimento_completo` abaixo espelha EXATAMENTE a assinatura
// SQL da função (seção `Functions`, 17 parâmetros `p_*` + `RETURNS uuid`) —
// não inventa nenhum parâmetro. Até a Story 3.7, as tabelas
// `estabelecimentos`/`estabelecimentos_horarios` NÃO tinham entrada em
// `Tables` porque nenhum adapter as consultava diretamente (toda escrita
// passava pela RPC, que roda `SECURITY DEFINER`).
//
// Story 3.7 (2026-08-12) — reconciliação manual adicional: `admin.supabase.ts`
// (`pendingStores`/`pendingStoreDetail`) passou a consultar `estabelecimentos`/
// `estabelecimentos_horarios` diretamente (SELECT, sob a policy
// `admin_gerencia_estab`/`admin_le_horarios`) e a chamar a função `is_admin()`
// (login real do Admin). As 3 entradas abaixo (`estabelecimentos`,
// `estabelecimentos_horarios`, `admin_users`) e a função `is_admin` espelham
// EXATAMENTE o schema confirmado por sonda real via REST
// (`GET {SUPABASE_URL}/rest/v1/` com `service_role`, OpenAPI `definitions`/
// `paths./rpc/is_admin`, 2026-08-12 — mesma limitação de ambiente sem
// `SUPABASE_ACCESS_TOKEN`/login para `supabase gen types`), aplicado pelas
// migrations `20260812123046` (estabelecimentos), `20260812123047`
// (estabelecimentos_horarios) e `20260812132330` (admin_users/is_admin).
// `Relationships: []` em ambas as tabelas — os adapters desta Story fazem 2
// queries separadas (estabelecimentos + estabelecimentos_horarios por
// `estabelecimento_id`) em vez de embed tipado do PostgREST, então nenhum
// call-site depende de metadata de FK aqui.
//
// Stories 3.8/3.9 (2026-08-12) — reconciliação manual adicional: as RPCs
// `public.aprovar_lojista(p_estab_id uuid)` e
// `public.rejeitar_lojista(p_estab_id uuid, p_motivo text)` foram aplicadas ao
// `keepit-dev` pelas migrations
// `apps/supabase/supabase/migrations/20260812132332_rpc_aprovar_lojista.sql` e
// `apps/supabase/supabase/migrations/20260812132333_rpc_rejeitar_lojista.sql`
// (@data-engineer), mesma limitação de ambiente (sem `SUPABASE_ACCESS_TOKEN`
// para `supabase gen types`). As 2 entradas abaixo espelham EXATAMENTE a
// assinatura SQL de cada função (`Args`/`RETURNS uuid`, tipado como `string`
// no client, mesmo padrão já usado por `criar_estabelecimento_completo`).
//
// Story 4.1 (2026-08-12) — reconciliação manual adicional: as tabelas
// `hubs`/`hubs_horarios` + o bucket público `hubs` foram aplicados ao
// `keepit-dev` pelas migrations
// `apps/supabase/supabase/migrations/20260812164000_criar_hubs.sql`,
// `20260812164100_criar_hubs_horarios.sql` e
// `20260812164200_storage_bucket_hubs.sql` (@data-engineer), mesma
// limitação de ambiente (sem `SUPABASE_ACCESS_TOKEN` para
// `supabase gen types`). As 2 entradas abaixo espelham EXATAMENTE o DDL das
// migrations (`hubs.lat`/`lng` `numeric(9,6) NOT NULL` — diferente de
// `estabelecimentos.lat`/`lng`, NULLABLE — ver comentário da própria
// migration). `Relationships: []` em ambas — `admin.supabase.ts#hubsCrud`
// faz queries separadas (mesmo padrão de `estabelecimentos`/
// `estabelecimentos_horarios`, Story 3.7), sem embed tipado do PostgREST.
//
// Stories 4.3/4.4 (2026-08-12) — reconciliação manual adicional: a tabela
// `produtos` + o bucket público `produtos` foram aplicados ao `keepit-dev`
// pelas migrations
// `apps/supabase/supabase/migrations/20260812190000_criar_produtos.sql`,
// `20260812190001_produtos_indice_trgm.sql` e
// `20260812190002_storage_bucket_produtos.sql` (@data-engineer), mesma
// limitação de ambiente (sem `SUPABASE_ACCESS_TOKEN` para
// `supabase gen types`). A entrada `produtos` abaixo espelha EXATAMENTE o
// DDL da migration `20260812190000` (`preco_reais numeric(10,2) NOT NULL`,
// mesmo tratamento numérico já usado em `estabelecimentos.taxa_deslocamento_reais`
// acima — tipado como `number`, não `string`). `Relationships: []` — os
// adapters desta Story (`product.supabase.ts`) não fazem embed tipado do
// PostgREST com `estabelecimentos`.
//
// Bloco 04 / Story 5.2 (2026-08-12) — reconciliação manual adicional: a
// tabela de junção `estabelecimentos_hubs` foi aplicada ao `keepit-dev` pela
// migration
// `apps/supabase/supabase/migrations/20260812213002_criar_estabelecimentos_hubs.sql`
// (@data-engineer), mesma limitação de ambiente (sem `SUPABASE_ACCESS_TOKEN`
// para `supabase gen types`). A entrada `estabelecimentos_hubs` abaixo
// espelha EXATAMENTE o DDL da migration (PK composta
// `(estabelecimento_id, hub_id)`, sem `id` próprio, só `criado_em` de
// auditoria). `Relationships: []` — `store.supabase.ts#listByHub` (Story
// 5.2) faz 2 queries separadas (`estabelecimentos_hubs` filtrado por
// `hub_id`, depois `estabelecimentos` por `.in('id', ...)`), sem embed
// tipado do PostgREST, mesmo padrão já usado pelas demais tabelas deste
// arquivo.
//
// Bloco 06 / Stories 6.6/6.7 (2026-08-13) — reconciliação manual adicional:
// as tabelas `pedidos`/`pedidos_itens` e a RPC `public.criar_pedido(...)`
// foram aplicadas ao `keepit-dev` pelas migrations
// `apps/supabase/supabase/migrations/20260813004932_criar_pedidos.sql`,
// `20260813004933_criar_pedidos_itens.sql` e
// `20260813004934_rpc_criar_pedido.sql` (@data-engineer), mesma limitação
// de ambiente (sem `SUPABASE_ACCESS_TOKEN` para `supabase gen types`). As 2
// entradas de tabela abaixo espelham EXATAMENTE o DDL aplicado (subset do
// piloto — colunas de rastreio pós-aceite `saiu_hub_em`/`cliente_chegou_em`/
// `lojista_chegou_em` e as de PIX/Asaas FICAM FORA, ver cabeçalho da
// migration `20260813004932`). `pin_hash` está no `Row` (reflete a coluna
// real), mas nenhum adapter deste bloco a inclui na `select()` — `pin_texto`
// é o único campo de PIN exposto pela `OrderPort` (`Pedido.pin_hash` não
// existe no tipo de domínio). `Relationships: []` em ambas — os adapters
// (`order.supabase.ts`) fazem 2 queries separadas (`pedidos` +
// `pedidos_itens` por `pedido_id`/`in()`), sem embed tipado do PostgREST,
// mesmo padrão já usado pelas demais tabelas deste arquivo. A entrada
// `criar_pedido` espelha EXATAMENTE a assinatura SQL da função (9
// parâmetros `p_*` + `RETURNS TABLE (pedido_id uuid, numero integer,
// pin_texto text)`, tipado como array de linhas no client, mesmo padrão de
// `criar_estabelecimento_completo` para `RETURNS TABLE`).
//
// Bloco 06 / Stories 6.8/6.9 (2026-08-13) — reconciliação manual adicional: as
// RPCs `public.meu_estabelecimento_id()` (RETURNS uuid, sem parâmetros) e
// `public.aceitar_pedido(p_pedido_id uuid, p_tempo_estimado_min int)`
// (RETURNS uuid) foram aplicadas ao `keepit-dev` pelas migrations
// `apps/supabase/supabase/migrations/20260813004932_criar_pedidos.sql`
// (helper `meu_estabelecimento_id`) e
// `20260813004935_rpc_aceitar_pedido.sql` (@data-engineer), mesma limitação
// de ambiente (sem `SUPABASE_ACCESS_TOKEN` para `supabase gen types`). As 2
// entradas abaixo espelham EXATAMENTE a assinatura SQL de cada função —
// `meu_estabelecimento_id` sem parâmetros (`Args: Record<PropertyKey, never>`,
// mesmo padrão de funções sem argumentos), `aceitar_pedido` com os 2
// parâmetros `p_*` — ambas `RETURNS uuid` (tipado como `string` no client,
// mesmo padrão de `aprovar_lojista`/`rejeitar_lojista`).
//
// Bloco 07 / Stories 6.12/6.15 (2026-08-13) — reconciliação manual adicional:
// as RPCs `public.avancar_estado_pedido(p_pedido_id uuid, p_novo_status text)`
// (RETURNS text) e `public.confirmar_pin_pedido(p_pedido_id uuid, p_pin text)`
// (RETURNS TABLE (resultado text, tentativas_restantes int, bloqueado_ate
// timestamptz)) foram aplicadas ao `keepit-dev` pelas migrations
// `apps/supabase/supabase/migrations/20260813022931_rpc_avancar_estado_pedido.sql`
// e `20260813022932_rpc_confirmar_pin_pedido.sql` (@data-engineer), mesma
// limitação de ambiente (sem `SUPABASE_ACCESS_TOKEN` para
// `supabase gen types`). As 2 entradas abaixo espelham EXATAMENTE a
// assinatura SQL de cada função — `avancar_estado_pedido` retorna o novo
// `status` como `string` (mesmo padrão de `aprovar_lojista`/
// `rejeitar_lojista`); `confirmar_pin_pedido` retorna `TABLE`, tipado como
// array de linhas no client (mesmo padrão de `criar_pedido`), com
// `tentativas_restantes`/`bloqueado_ate` nullable (a RPC retorna `NULL` no
// desfecho `'entregue'`).
//
// Bloco 08 / Stories 7.6/7.7/7.8 (2026-08-13) — reconciliação manual adicional:
// a tabela `lancamentos_financeiros` (ledger único append-only), a view
// `carteira_lojista` (`security_invoker = true`) e a RPC
// `public.solicitar_saque(p_valor_centavos bigint)` foram aplicadas ao
// `keepit-dev` pelas migrations
// `apps/supabase/supabase/migrations/20260813050000_criar_lancamentos_financeiros.sql`,
// `20260813050001_criar_view_carteira_lojista.sql` e
// `20260813050004_rpc_solicitar_saque.sql` (@data-engineer), mesma limitação
// de ambiente (sem `SUPABASE_ACCESS_TOKEN` para `supabase gen types`). A
// entrada `lancamentos_financeiros` espelha EXATAMENTE o DDL aplicado (Model
// B — ver comentário da própria migration); `Relationships: []` — os
// adapters deste bloco (`wallet.supabase.ts`, `analytics.supabase.ts`) fazem
// queries diretas (`select().eq()`), sem embed tipado do PostgREST. A entrada
// `carteira_lojista` (em `Views`, não `Tables` — é uma view) espelha os 5
// campos de saída (`estabelecimento_id` + 4 saldos em REAIS, já divididos por
// 100 na própria view SQL). A entrada `solicitar_saque` espelha EXATAMENTE a
// assinatura SQL da função (1 parâmetro `p_valor_centavos bigint`,
// `RETURNS TABLE (lancamento_id, estabelecimento_id, valor_centavos, status,
// solicitado_em)`, mesmo padrão de `criar_pedido`/`confirmar_pin_pedido` para
// `RETURNS TABLE`).
//
// Regenerar via `supabase gen types typescript --project-id
// jhhbewnmnorhmsdvfppo` (com login) substitui todos os blocos manuais sem
// alteração de forma esperada.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _canary: {
        Row: {
          id: number
          message: string | null
        }
        Insert: {
          id?: number
          message?: string | null
        }
        Update: {
          id?: number
          message?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          id: string
          nome: string
          telefone: string | null
          cpf: string | null
          criado_em: string
        }
        Insert: {
          id: string
          nome: string
          telefone?: string | null
          cpf?: string | null
          criado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          telefone?: string | null
          cpf?: string | null
          criado_em?: string
        }
        Relationships: []
      }
      // Story 3.7 — ver comentário de reconciliação manual no topo do arquivo.
      estabelecimentos: {
        Row: {
          id: string
          dono_user_id: string
          nome_fantasia: string
          cnpj: string
          responsavel_nome: string
          telefone: string
          categoria: string
          descricao: string | null
          foto_fachada_url: string | null
          dados_receita: Json | null
          endereco: string
          lat: number | null
          lng: number | null
          raio_atendimento_km: number | null
          tempo_medio_entrega_min: number
          taxa_deslocamento_reais: number
          ticket_minimo_reais: number | null
          chave_pix: string
          chave_pix_tipo: string
          asaas_wallet_id: string | null
          status: string
          motivo_rejeicao: string | null
          motivo_suspensao: string | null
          pausado_manualmente: boolean
          aprovado_em: string | null
          aprovado_por: string | null
          suspenso_em: string | null
          criado_em: string
          atualizado_em: string
          excluido_em: string | null
        }
        Insert: {
          id?: string
          dono_user_id: string
          nome_fantasia: string
          cnpj: string
          responsavel_nome: string
          telefone: string
          categoria: string
          descricao?: string | null
          foto_fachada_url?: string | null
          dados_receita?: Json | null
          endereco: string
          lat?: number | null
          lng?: number | null
          raio_atendimento_km?: number | null
          tempo_medio_entrega_min: number
          taxa_deslocamento_reais?: number
          ticket_minimo_reais?: number | null
          chave_pix: string
          chave_pix_tipo: string
          asaas_wallet_id?: string | null
          status?: string
          motivo_rejeicao?: string | null
          motivo_suspensao?: string | null
          pausado_manualmente?: boolean
          aprovado_em?: string | null
          aprovado_por?: string | null
          suspenso_em?: string | null
          criado_em?: string
          atualizado_em?: string
          excluido_em?: string | null
        }
        Update: {
          id?: string
          dono_user_id?: string
          nome_fantasia?: string
          cnpj?: string
          responsavel_nome?: string
          telefone?: string
          categoria?: string
          descricao?: string | null
          foto_fachada_url?: string | null
          dados_receita?: Json | null
          endereco?: string
          lat?: number | null
          lng?: number | null
          raio_atendimento_km?: number | null
          tempo_medio_entrega_min?: number
          taxa_deslocamento_reais?: number
          ticket_minimo_reais?: number | null
          chave_pix?: string
          chave_pix_tipo?: string
          asaas_wallet_id?: string | null
          status?: string
          motivo_rejeicao?: string | null
          motivo_suspensao?: string | null
          pausado_manualmente?: boolean
          aprovado_em?: string | null
          aprovado_por?: string | null
          suspenso_em?: string | null
          criado_em?: string
          atualizado_em?: string
          excluido_em?: string | null
        }
        Relationships: []
      }
      // Story 3.7 — ver comentário de reconciliação manual no topo do arquivo.
      estabelecimentos_horarios: {
        Row: {
          estabelecimento_id: string
          dia_semana: number
          aberto: boolean
          hora_abre: string | null
          hora_fecha: string | null
        }
        Insert: {
          estabelecimento_id: string
          dia_semana: number
          aberto?: boolean
          hora_abre?: string | null
          hora_fecha?: string | null
        }
        Update: {
          estabelecimento_id?: string
          dia_semana?: number
          aberto?: boolean
          hora_abre?: string | null
          hora_fecha?: string | null
        }
        Relationships: []
      }
      // Bloco 04 / Story 5.2 — ver comentário de reconciliação manual no topo do arquivo.
      estabelecimentos_hubs: {
        Row: {
          estabelecimento_id: string
          hub_id: string
          criado_em: string
        }
        Insert: {
          estabelecimento_id: string
          hub_id: string
          criado_em?: string
        }
        Update: {
          estabelecimento_id?: string
          hub_id?: string
          criado_em?: string
        }
        Relationships: []
      }
      // Story 4.1 — ver comentário de reconciliação manual no topo do arquivo.
      hubs: {
        Row: {
          id: string
          nome: string
          endereco: string
          lat: number
          lng: number
          ponto_referencia: string | null
          foto_url: string | null
          ativo: boolean
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          nome: string
          endereco: string
          lat: number
          lng: number
          ponto_referencia?: string | null
          foto_url?: string | null
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          endereco?: string
          lat?: number
          lng?: number
          ponto_referencia?: string | null
          foto_url?: string | null
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      // Story 4.1 — ver comentário de reconciliação manual no topo do arquivo.
      hubs_horarios: {
        Row: {
          hub_id: string
          dia_semana: number
          aberto: boolean
          hora_abre: string | null
          hora_fecha: string | null
        }
        Insert: {
          hub_id: string
          dia_semana: number
          aberto?: boolean
          hora_abre?: string | null
          hora_fecha?: string | null
        }
        Update: {
          hub_id?: string
          dia_semana?: number
          aberto?: boolean
          hora_abre?: string | null
          hora_fecha?: string | null
        }
        Relationships: []
      }
      // Stories 4.3/4.4 — ver comentário de reconciliação manual no topo do arquivo.
      produtos: {
        Row: {
          id: string
          estabelecimento_id: string
          nome: string
          descricao: string | null
          preco_reais: number
          categoria_produto: string
          foto_url: string | null
          ativo: boolean
          criado_em: string
          atualizado_em: string
          excluido_em: string | null
        }
        Insert: {
          id?: string
          estabelecimento_id: string
          nome: string
          descricao?: string | null
          preco_reais: number
          categoria_produto: string
          foto_url?: string | null
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
          excluido_em?: string | null
        }
        Update: {
          id?: string
          estabelecimento_id?: string
          nome?: string
          descricao?: string | null
          preco_reais?: number
          categoria_produto?: string
          foto_url?: string | null
          ativo?: boolean
          criado_em?: string
          atualizado_em?: string
          excluido_em?: string | null
        }
        Relationships: []
      }
      // Bloco 06 / Stories 6.6/6.7 — ver comentário de reconciliação manual no topo do arquivo.
      pedidos: {
        Row: {
          id: string
          numero: number
          cliente_id: string
          estabelecimento_id: string
          hub_id: string
          status: string
          pin_hash: string
          pin_texto: string
          tentativas_pin: number
          pin_bloqueado_ate: string | null
          tempo_estimado_min: number | null
          criado_em: string
          pago_em: string | null
          aceito_em: string | null
          entregue_em: string | null
          cancelado_em: string | null
          subtotal_produtos_reais: number
          taxa_deslocamento_reais: number
          taxa_keepit_reais: number
          taxa_servico_comprador_reais: number
          total_pago_reais: number
          nf_solicitada: boolean
          motivo_recusa: string | null
          motivo_cancelamento: string | null
          motivo_nao_retirado: string | null
          forma_pagamento: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          numero?: number
          cliente_id: string
          estabelecimento_id: string
          hub_id: string
          status?: string
          pin_hash: string
          pin_texto: string
          tentativas_pin?: number
          pin_bloqueado_ate?: string | null
          tempo_estimado_min?: number | null
          criado_em?: string
          pago_em?: string | null
          aceito_em?: string | null
          entregue_em?: string | null
          cancelado_em?: string | null
          subtotal_produtos_reais: number
          taxa_deslocamento_reais: number
          taxa_keepit_reais: number
          taxa_servico_comprador_reais?: number
          total_pago_reais: number
          nf_solicitada?: boolean
          motivo_recusa?: string | null
          motivo_cancelamento?: string | null
          motivo_nao_retirado?: string | null
          forma_pagamento?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          numero?: number
          cliente_id?: string
          estabelecimento_id?: string
          hub_id?: string
          status?: string
          pin_hash?: string
          pin_texto?: string
          tentativas_pin?: number
          pin_bloqueado_ate?: string | null
          tempo_estimado_min?: number | null
          criado_em?: string
          pago_em?: string | null
          aceito_em?: string | null
          entregue_em?: string | null
          cancelado_em?: string | null
          subtotal_produtos_reais?: number
          taxa_deslocamento_reais?: number
          taxa_keepit_reais?: number
          taxa_servico_comprador_reais?: number
          total_pago_reais?: number
          nf_solicitada?: boolean
          motivo_recusa?: string | null
          motivo_cancelamento?: string | null
          motivo_nao_retirado?: string | null
          forma_pagamento?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      // Bloco 06 / Stories 6.6/6.7 — ver comentário de reconciliação manual no topo do arquivo.
      pedidos_itens: {
        Row: {
          id: string
          pedido_id: string
          produto_id: string | null
          nome_snapshot: string
          preco_unitario_reais: number
          quantidade: number
          subtotal_reais: number
        }
        Insert: {
          id?: string
          pedido_id: string
          produto_id?: string | null
          nome_snapshot: string
          preco_unitario_reais: number
          quantidade: number
          subtotal_reais: number
        }
        Update: {
          id?: string
          pedido_id?: string
          produto_id?: string | null
          nome_snapshot?: string
          preco_unitario_reais?: number
          quantidade?: number
          subtotal_reais?: number
        }
        Relationships: []
      }
      // Bloco 08 / Stories 7.6/7.7/7.8 — ver comentário de reconciliação manual no topo do arquivo.
      lancamentos_financeiros: {
        Row: {
          id: string
          estabelecimento_id: string
          pedido_id: string | null
          tipo: string
          valor_centavos: number
          status: string
          asaas_id_externo: string | null
          ator_admin_id: string | null
          detalhe: string | null
          disponivel_em: string | null
          criado_em: string
          concluido_em: string | null
        }
        Insert: {
          id?: string
          estabelecimento_id: string
          pedido_id?: string | null
          tipo: string
          valor_centavos: number
          status?: string
          asaas_id_externo?: string | null
          ator_admin_id?: string | null
          detalhe?: string | null
          disponivel_em?: string | null
          criado_em?: string
          concluido_em?: string | null
        }
        Update: {
          id?: string
          estabelecimento_id?: string
          pedido_id?: string | null
          tipo?: string
          valor_centavos?: number
          status?: string
          asaas_id_externo?: string | null
          ator_admin_id?: string | null
          detalhe?: string | null
          disponivel_em?: string | null
          criado_em?: string
          concluido_em?: string | null
        }
        Relationships: []
      }
      // Story 3.7 — ver comentário de reconciliação manual no topo do arquivo.
      admin_users: {
        Row: {
          id: string
          nome: string
          criado_em: string
        }
        Insert: {
          id: string
          nome: string
          criado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          criado_em?: string
        }
        Relationships: []
      }
    }
    Views: {
      // Bloco 08 / Stories 7.6/7.7/7.8 — ver comentário de reconciliação manual no topo do arquivo.
      carteira_lojista: {
        Row: {
          estabelecimento_id: string
          saldo_disponivel_reais: number
          saldo_bloqueado_reais: number
          total_sacado_reais: number
          total_debitado_reais: number
        }
        Relationships: []
      }
    }
    Functions: {
      // Story 3.5 — ver comentário de reconciliação manual no topo do arquivo.
      criar_estabelecimento_completo: {
        Args: {
          p_nome_fantasia: string
          p_cnpj: string
          p_responsavel_nome: string
          p_telefone: string
          p_categoria: string
          p_endereco: string
          p_lat: number | null
          p_lng: number | null
          p_raio_atendimento_km: number | null
          p_tempo_medio_entrega_min: number
          p_taxa_deslocamento_reais: number | null
          p_ticket_minimo_reais: number | null
          p_chave_pix: string
          p_chave_pix_tipo: string
          p_foto_fachada_url: string | null
          p_descricao: string | null
          p_horarios: Json
        }
        Returns: string
      }
      // Story 3.7 — ver comentário de reconciliação manual no topo do arquivo.
      is_admin: {
        Args: {
          user_id?: string
        }
        Returns: boolean
      }
      // Stories 3.8/3.9 — ver comentário de reconciliação manual no topo do arquivo.
      aprovar_lojista: {
        Args: {
          p_estab_id: string
        }
        Returns: string
      }
      // Stories 3.8/3.9 — ver comentário de reconciliação manual no topo do arquivo.
      rejeitar_lojista: {
        Args: {
          p_estab_id: string
          p_motivo: string
        }
        Returns: string
      }
      // Bloco 06 / Stories 6.6/6.7 — ver comentário de reconciliação manual no topo do arquivo.
      criar_pedido: {
        Args: {
          p_estabelecimento_id: string
          p_hub_id: string
          p_itens: Json
          p_subtotal_produtos_reais: number
          p_taxa_deslocamento_reais: number
          p_taxa_keepit_reais: number
          p_taxa_servico_comprador_reais: number
          p_total_pago_reais: number
          p_nf_solicitada: boolean
        }
        Returns: {
          pedido_id: string
          numero: number
          pin_texto: string
        }[]
      }
      // Bloco 06 / Stories 6.8/6.9 — ver comentário de reconciliação manual no topo do arquivo.
      meu_estabelecimento_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      // Bloco 06 / Story 6.9 — ver comentário de reconciliação manual no topo do arquivo.
      aceitar_pedido: {
        Args: {
          p_pedido_id: string
          p_tempo_estimado_min: number
        }
        Returns: string
      }
      // Bloco 07 / Story 6.12 — ver comentário de reconciliação manual no topo do arquivo.
      avancar_estado_pedido: {
        Args: {
          p_pedido_id: string
          p_novo_status: string
        }
        Returns: string
      }
      // Bloco 07 / Story 6.15 — ver comentário de reconciliação manual no topo do arquivo.
      confirmar_pin_pedido: {
        Args: {
          p_pedido_id: string
          p_pin: string
        }
        Returns: {
          resultado: string
          tentativas_restantes: number | null
          bloqueado_ate: string | null
        }[]
      }
      // Bloco 08 / Story 7.8 — ver comentário de reconciliação manual no topo do arquivo.
      solicitar_saque: {
        Args: {
          p_valor_centavos: number
        }
        Returns: {
          lancamento_id: string
          estabelecimento_id: string
          valor_centavos: number
          status: string
          solicitado_em: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
