// GERADO A PARTIR DO SCHEMA REAL — projeto Supabase `keepit-dev` (ref
// jhhbewnmnorhmsdvfppo), via `mcp__supabase__generate_typescript_types`.
//
// Bloco 12 (Higiene, 2026-08-13) — reconciliação canônica: os blocos
// 01-09 mantiveram este arquivo atualizado à mão (sem `SUPABASE_ACCESS_TOKEN`
// disponível para `supabase gen types` via CLI), acumulando um cabeçalho
// story-a-story documentando cada reconciliação manual. Esta Story trocou
// esse processo por uma leitura direta do schema ao vivo via MCP, cobrindo
// TODAS as tabelas/views/funções aplicadas até aqui (inclui `pedidos.saiu_hub_em`
// e a função `pode_ver_pedido`, que faltavam no arquivo hand-reconciled) — o
// histórico de "quem aplicou o quê" continua nas migrations em
// `apps/supabase/supabase/migrations/` e nos arquivos de Story em
// `docs/stories/`, não precisa ser duplicado aqui.
//
// NÃO editar à mão — regenerar via `generate_typescript_types` quando o
// schema mudar. As seções abaixo de `DatabaseWithoutInternals` (Tables<>,
// TablesInsert<>, TablesUpdate<>, Enums<>, CompositeTypes<>, Constants) são
// aliases de conveniência hand-added desde a Story 1.4 — não fazem parte do
// output bruto do gerador, mas são preservados porque `index.ts` os
// reexporta (`export * from './supabase'`).
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
      admin_users: {
        Row: {
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          criado_em?: string
          id: string
          nome: string
        }
        Update: {
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          bloqueado: boolean
          bloqueado_em: string | null
          cpf: string | null
          criado_em: string
          id: string
          motivo_bloqueio: string | null
          nome: string
          telefone: string | null
        }
        Insert: {
          bloqueado?: boolean
          bloqueado_em?: string | null
          cpf?: string | null
          criado_em?: string
          id: string
          motivo_bloqueio?: string | null
          nome: string
          telefone?: string | null
        }
        Update: {
          bloqueado?: boolean
          bloqueado_em?: string | null
          cpf?: string | null
          criado_em?: string
          id?: string
          motivo_bloqueio?: string | null
          nome?: string
          telefone?: string | null
        }
        Relationships: []
      }
      estabelecimentos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          asaas_wallet_id: string | null
          atualizado_em: string
          categoria: string
          chave_pix: string
          chave_pix_tipo: string
          cnpj: string
          criado_em: string
          dados_receita: Json | null
          descricao: string | null
          dono_user_id: string
          endereco: string
          excluido_em: string | null
          foto_fachada_url: string | null
          id: string
          lat: number | null
          lng: number | null
          motivo_rejeicao: string | null
          motivo_suspensao: string | null
          nome_fantasia: string
          pausado_manualmente: boolean
          raio_atendimento_km: number | null
          responsavel_nome: string
          status: string
          suspenso_em: string | null
          taxa_deslocamento_reais: number
          telefone: string
          tempo_medio_entrega_min: number
          ticket_minimo_reais: number | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          asaas_wallet_id?: string | null
          atualizado_em?: string
          categoria: string
          chave_pix: string
          chave_pix_tipo: string
          cnpj: string
          criado_em?: string
          dados_receita?: Json | null
          descricao?: string | null
          dono_user_id: string
          endereco: string
          excluido_em?: string | null
          foto_fachada_url?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          motivo_rejeicao?: string | null
          motivo_suspensao?: string | null
          nome_fantasia: string
          pausado_manualmente?: boolean
          raio_atendimento_km?: number | null
          responsavel_nome: string
          status?: string
          suspenso_em?: string | null
          taxa_deslocamento_reais?: number
          telefone: string
          tempo_medio_entrega_min: number
          ticket_minimo_reais?: number | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          asaas_wallet_id?: string | null
          atualizado_em?: string
          categoria?: string
          chave_pix?: string
          chave_pix_tipo?: string
          cnpj?: string
          criado_em?: string
          dados_receita?: Json | null
          descricao?: string | null
          dono_user_id?: string
          endereco?: string
          excluido_em?: string | null
          foto_fachada_url?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          motivo_rejeicao?: string | null
          motivo_suspensao?: string | null
          nome_fantasia?: string
          pausado_manualmente?: boolean
          raio_atendimento_km?: number | null
          responsavel_nome?: string
          status?: string
          suspenso_em?: string | null
          taxa_deslocamento_reais?: number
          telefone?: string
          tempo_medio_entrega_min?: number
          ticket_minimo_reais?: number | null
        }
        Relationships: []
      }
      estabelecimentos_falhas: {
        Row: {
          criado_em: string
          detalhes: string | null
          estabelecimento_id: string
          id: string
          pedido_id: string | null
          tipo: string
        }
        Insert: {
          criado_em?: string
          detalhes?: string | null
          estabelecimento_id: string
          id?: string
          pedido_id?: string | null
          tipo: string
        }
        Update: {
          criado_em?: string
          detalhes?: string | null
          estabelecimento_id?: string
          id?: string
          pedido_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "estabelecimentos_falhas_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "carteira_lojista"
            referencedColumns: ["estabelecimento_id"]
          },
          {
            foreignKeyName: "estabelecimentos_falhas_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estabelecimentos_falhas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      estabelecimentos_horarios: {
        Row: {
          aberto: boolean
          dia_semana: number
          estabelecimento_id: string
          hora_abre: string | null
          hora_fecha: string | null
        }
        Insert: {
          aberto?: boolean
          dia_semana: number
          estabelecimento_id: string
          hora_abre?: string | null
          hora_fecha?: string | null
        }
        Update: {
          aberto?: boolean
          dia_semana?: number
          estabelecimento_id?: string
          hora_abre?: string | null
          hora_fecha?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estabelecimentos_horarios_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "carteira_lojista"
            referencedColumns: ["estabelecimento_id"]
          },
          {
            foreignKeyName: "estabelecimentos_horarios_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      estabelecimentos_hubs: {
        Row: {
          criado_em: string
          estabelecimento_id: string
          hub_id: string
        }
        Insert: {
          criado_em?: string
          estabelecimento_id: string
          hub_id: string
        }
        Update: {
          criado_em?: string
          estabelecimento_id?: string
          hub_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estabelecimentos_hubs_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "carteira_lojista"
            referencedColumns: ["estabelecimento_id"]
          },
          {
            foreignKeyName: "estabelecimentos_hubs_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estabelecimentos_hubs_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      hubs: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          endereco: string
          foto_url: string | null
          id: string
          lat: number
          lng: number
          nome: string
          ponto_referencia: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          endereco: string
          foto_url?: string | null
          id?: string
          lat: number
          lng: number
          nome: string
          ponto_referencia?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          endereco?: string
          foto_url?: string | null
          id?: string
          lat?: number
          lng?: number
          nome?: string
          ponto_referencia?: string | null
        }
        Relationships: []
      }
      hubs_horarios: {
        Row: {
          aberto: boolean
          dia_semana: number
          hora_abre: string | null
          hora_fecha: string | null
          hub_id: string
        }
        Insert: {
          aberto?: boolean
          dia_semana: number
          hora_abre?: string | null
          hora_fecha?: string | null
          hub_id: string
        }
        Update: {
          aberto?: boolean
          dia_semana?: number
          hora_abre?: string | null
          hora_fecha?: string | null
          hub_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubs_horarios_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos_financeiros: {
        Row: {
          asaas_id_externo: string | null
          ator_admin_id: string | null
          concluido_em: string | null
          criado_em: string
          detalhe: string | null
          disponivel_em: string | null
          estabelecimento_id: string
          id: string
          pedido_id: string | null
          status: string
          tipo: string
          valor_centavos: number
        }
        Insert: {
          asaas_id_externo?: string | null
          ator_admin_id?: string | null
          concluido_em?: string | null
          criado_em?: string
          detalhe?: string | null
          disponivel_em?: string | null
          estabelecimento_id: string
          id?: string
          pedido_id?: string | null
          status?: string
          tipo: string
          valor_centavos: number
        }
        Update: {
          asaas_id_externo?: string | null
          ator_admin_id?: string | null
          concluido_em?: string | null
          criado_em?: string
          detalhe?: string | null
          disponivel_em?: string | null
          estabelecimento_id?: string
          id?: string
          pedido_id?: string | null
          status?: string
          tipo?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_financeiros_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "carteira_lojista"
            referencedColumns: ["estabelecimento_id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          aceito_em: string | null
          atualizado_em: string
          cancelado_em: string | null
          cliente_id: string
          criado_em: string
          entregue_em: string | null
          estabelecimento_id: string
          forma_pagamento: string
          hub_id: string
          id: string
          motivo_cancelamento: string | null
          motivo_nao_retirado: string | null
          motivo_recusa: string | null
          nf_solicitada: boolean
          numero: number
          pago_em: string | null
          pin_bloqueado_ate: string | null
          pin_hash: string
          pin_texto: string
          saiu_hub_em: string | null
          status: string
          subtotal_produtos_reais: number
          taxa_deslocamento_reais: number
          taxa_keepit_reais: number
          taxa_servico_comprador_reais: number
          tempo_estimado_min: number | null
          tentativas_pin: number
          total_pago_reais: number
        }
        Insert: {
          aceito_em?: string | null
          atualizado_em?: string
          cancelado_em?: string | null
          cliente_id: string
          criado_em?: string
          entregue_em?: string | null
          estabelecimento_id: string
          forma_pagamento?: string
          hub_id: string
          id?: string
          motivo_cancelamento?: string | null
          motivo_nao_retirado?: string | null
          motivo_recusa?: string | null
          nf_solicitada?: boolean
          numero?: number
          pago_em?: string | null
          pin_bloqueado_ate?: string | null
          pin_hash: string
          pin_texto: string
          saiu_hub_em?: string | null
          status?: string
          subtotal_produtos_reais: number
          taxa_deslocamento_reais: number
          taxa_keepit_reais: number
          taxa_servico_comprador_reais?: number
          tempo_estimado_min?: number | null
          tentativas_pin?: number
          total_pago_reais: number
        }
        Update: {
          aceito_em?: string | null
          atualizado_em?: string
          cancelado_em?: string | null
          cliente_id?: string
          criado_em?: string
          entregue_em?: string | null
          estabelecimento_id?: string
          forma_pagamento?: string
          hub_id?: string
          id?: string
          motivo_cancelamento?: string | null
          motivo_nao_retirado?: string | null
          motivo_recusa?: string | null
          nf_solicitada?: boolean
          numero?: number
          pago_em?: string | null
          pin_bloqueado_ate?: string | null
          pin_hash?: string
          pin_texto?: string
          saiu_hub_em?: string | null
          status?: string
          subtotal_produtos_reais?: number
          taxa_deslocamento_reais?: number
          taxa_keepit_reais?: number
          taxa_servico_comprador_reais?: number
          tempo_estimado_min?: number | null
          tentativas_pin?: number
          total_pago_reais?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "carteira_lojista"
            referencedColumns: ["estabelecimento_id"]
          },
          {
            foreignKeyName: "pedidos_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_itens: {
        Row: {
          id: string
          nome_snapshot: string
          pedido_id: string
          preco_unitario_reais: number
          produto_id: string | null
          quantidade: number
          subtotal_reais: number
        }
        Insert: {
          id?: string
          nome_snapshot: string
          pedido_id: string
          preco_unitario_reais: number
          produto_id?: string | null
          quantidade: number
          subtotal_reais: number
        }
        Update: {
          id?: string
          nome_snapshot?: string
          pedido_id?: string
          preco_unitario_reais?: number
          produto_id?: string | null
          quantidade?: number
          subtotal_reais?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria_produto: string
          criado_em: string
          descricao: string | null
          estabelecimento_id: string
          excluido_em: string | null
          foto_url: string | null
          id: string
          nome: string
          preco_reais: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria_produto: string
          criado_em?: string
          descricao?: string | null
          estabelecimento_id: string
          excluido_em?: string | null
          foto_url?: string | null
          id?: string
          nome: string
          preco_reais: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria_produto?: string
          criado_em?: string
          descricao?: string | null
          estabelecimento_id?: string
          excluido_em?: string | null
          foto_url?: string | null
          id?: string
          nome?: string
          preco_reais?: number
        }
        Relationships: [
          {
            foreignKeyName: "produtos_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "carteira_lojista"
            referencedColumns: ["estabelecimento_id"]
          },
          {
            foreignKeyName: "produtos_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      carteira_lojista: {
        Row: {
          estabelecimento_id: string | null
          saldo_bloqueado_reais: number | null
          saldo_disponivel_reais: number | null
          total_debitado_reais: number | null
          total_sacado_reais: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      aceitar_pedido: {
        Args: { p_pedido_id: string; p_tempo_estimado_min: number }
        Returns: string
      }
      aprovar_lojista: { Args: { p_estab_id: string }; Returns: string }
      avancar_estado_pedido: {
        Args: { p_novo_status: string; p_pedido_id: string }
        Returns: string
      }
      bloquear_cliente: {
        Args: { p_cliente_id: string; p_motivo: string }
        Returns: {
          bloqueado: boolean
          bloqueado_em: string
          cliente_id: string
        }[]
      }
      // Bloco 12 — `p_asaas_id_externo`/`p_detalhe` ampliados para `| null`
      // (o gerador só marca args com `DEFAULT` como opcionais via `?`, mas
      // não infere nulidade a partir do catálogo; a migration
      // `20260813070000_rpc_confirmar_lancamento_admin.sql` declara ambos
      // `text DEFAULT NULL`, e `admin.supabase.ts` passa `detalhe ?? null`
      // de propósito). Sem essa correção, `supabase gen types` bruto
      // quebraria a chamada real do adapter.
      confirmar_lancamento_admin: {
        Args: {
          p_asaas_id_externo?: string | null
          p_detalhe?: string | null
          p_lancamento_id: string
          p_resultado: string
        }
        Returns: {
          ator_admin_id: string
          concluido_em: string
          lancamento_id: string
          status: string
          tipo: string
        }[]
      }
      confirmar_pin_pedido: {
        Args: { p_pedido_id: string; p_pin: string }
        Returns: {
          bloqueado_ate: string
          resultado: string
          tentativas_restantes: number
        }[]
      }
      // Bloco 12 — `p_lat`/`p_lng`/`p_raio_atendimento_km`/`p_ticket_minimo_reais`/
      // `p_foto_fachada_url`/`p_descricao` ampliados para `| null`. A migration
      // `20260812123048_rpc_criar_estabelecimento_completo.sql` os declara
      // como `numeric`/`text` simples (sem `DEFAULT`, então sempre exigidos
      // pelo caller, mas SEM `NOT NULL` — Postgres não permite essa
      // constraint em parâmetro de função). `estabelecimento-cadastro.supabase.ts`
      // repassa `input.lat`/`input.descricao`/etc., que são legitimamente
      // `null` quando o lojista não preenche esses campos opcionais do
      // cadastro. O gerador bruto (`supabase gen types`) não infere
      // nulidade de parâmetro a partir do catálogo — só marca `?` quando há
      // `DEFAULT` — então essa correção é necessária para refletir o que a
      // RPC de fato aceita, sem alterar nenhum comportamento de runtime.
      criar_estabelecimento_completo: {
        Args: {
          p_categoria: string
          p_chave_pix: string
          p_chave_pix_tipo: string
          p_cnpj: string
          p_descricao: string | null
          p_endereco: string
          p_foto_fachada_url: string | null
          p_horarios: Json
          p_lat: number | null
          p_lng: number | null
          p_nome_fantasia: string
          p_raio_atendimento_km: number | null
          p_responsavel_nome: string
          p_taxa_deslocamento_reais: number
          p_telefone: string
          p_tempo_medio_entrega_min: number
          p_ticket_minimo_reais: number | null
        }
        Returns: string
      }
      criar_pedido: {
        Args: {
          p_estabelecimento_id: string
          p_hub_id: string
          p_itens: Json
          p_nf_solicitada: boolean
          p_subtotal_produtos_reais: number
          p_taxa_deslocamento_reais: number
          p_taxa_keepit_reais: number
          p_taxa_servico_comprador_reais: number
          p_total_pago_reais: number
        }
        Returns: {
          numero: number
          pedido_id: string
          pin_texto: string
        }[]
      }
      desbloquear_cliente: {
        Args: { p_cliente_id: string }
        Returns: {
          bloqueado: boolean
          cliente_id: string
        }[]
      }
      forcar_cancelamento_pedido: {
        Args: { p_motivo: string; p_pedido_id: string }
        Returns: {
          pedido_id: string
          refund_centavos: number
          refund_id: string
          status: string
        }[]
      }
      is_admin: { Args: { user_id?: string }; Returns: boolean }
      meu_estabelecimento_id: { Args: never; Returns: string }
      pode_ver_pedido: {
        Args: { pedido_row: Database["public"]["Tables"]["pedidos"]["Row"] }
        Returns: boolean
      }
      reativar_lojista: {
        Args: { p_estabelecimento_id: string }
        Returns: {
          estabelecimento_id: string
          status: string
        }[]
      }
      rejeitar_lojista: {
        Args: { p_estab_id: string; p_motivo: string }
        Returns: string
      }
      solicitar_saque: {
        Args: { p_valor_centavos: number }
        Returns: {
          estabelecimento_id: string
          lancamento_id: string
          solicitado_em: string
          status: string
          valor_centavos: number
        }[]
      }
      suspender_lojista: {
        Args: { p_estabelecimento_id: string; p_motivo: string }
        Returns: {
          estabelecimento_id: string
          status: string
          suspenso_em: string
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
