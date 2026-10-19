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
// Stories 12.11/12.13 (2026-09-05) — overlay de drift derivado do output oficial
// `mcp__codex_apps__supabase_generate_typescript_types`: adiciona somente
// favoritos, `account_deletion_requests` e sua RPC de cancelamento.
// O keepit-dev ainda não recebeu as migrations locais 20260814000004–00006;
// por isso, suas colunas/RPCs forward-schema permanecem verbatim abaixo.
// Regenerar o arquivo inteiro assim que o histórico remoto alcançar o repo.
// Task 2 cartões (2026-10-15): overlay das novas relações/RPCs derivado de
// supabase@2.72.7 gen types --local --schema public,private em banco descartável.
// O schema remoto não foi modificado por esta geração.
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
  private: {
    Tables: {
      cartoes_gestao_operacoes: {
        Row: {
          acao: string
          cartao_id: string
          cliente_id: string
          created_at: string
          operacao_id: string
        }
        Insert: {
          acao: string
          cartao_id: string
          cliente_id: string
          created_at?: string
          operacao_id: string
        }
        Update: {
          acao?: string
          cartao_id?: string
          cliente_id?: string
          created_at?: string
          operacao_id?: string
        }
        Relationships: []
      }
      account_deletion_files: {
        Row: {
          bucket: string
          created_at: string
          estado: string
          id: string
          path: string
          request_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          estado?: string
          id?: string
          path: string
          request_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          estado?: string
          id?: string
          path?: string
          request_id?: string
        }
        Relationships: []
      }
      cartoes_operacoes: {
        Row: {
          ambiente: string
          asaas_customer_id: string | null
          asaas_payment_id: string | null
          aviso_codigo: string | null
          bandeira_temporaria: string | null
          cartao_salvo_id: string | null
          claim_expira_em: string | null
          claim_token: string | null
          cliente_id: string | null
          contexto: string
          created_at: string
          estado: string
          id: string
          operacao_id: string
          resposta_cobranca_perdida: boolean
          salvar_cartao: boolean
          tentativa_id: string | null
          token_temporario: string | null
          ultimo4_temporario: string | null
          updated_at: string
        }
        Insert: {
          ambiente: string
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          aviso_codigo?: string | null
          bandeira_temporaria?: string | null
          cartao_salvo_id?: string | null
          claim_expira_em?: string | null
          claim_token?: string | null
          cliente_id?: string | null
          contexto: string
          created_at?: string
          estado?: string
          id?: string
          operacao_id: string
          resposta_cobranca_perdida?: boolean
          salvar_cartao: boolean
          tentativa_id?: string | null
          token_temporario?: string | null
          ultimo4_temporario?: string | null
          updated_at?: string
        }
        Update: {
          ambiente?: string
          asaas_customer_id?: string | null
          asaas_payment_id?: string | null
          aviso_codigo?: string | null
          bandeira_temporaria?: string | null
          cartao_salvo_id?: string | null
          claim_expira_em?: string | null
          claim_token?: string | null
          cliente_id?: string | null
          contexto?: string
          created_at?: string
          estado?: string
          id?: string
          operacao_id?: string
          resposta_cobranca_perdida?: boolean
          salvar_cartao?: boolean
          tentativa_id?: string | null
          token_temporario?: string | null
          ultimo4_temporario?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      validacoes_cartoes: {
        Row: {
          ambiente: string
          asaas_cobranca_id: string | null
          asaas_customer_id: string | null
          asaas_estorno_id: string | null
          bandeira_temporaria: string | null
          claim_etapa: string | null
          claim_expira_em: string | null
          claim_token: string | null
          cliente_id: string | null
          created_at: string
          erro_seguro: string | null
          estorno_confirmado: boolean
          estado: string
          id: string
          operacao_id: string
          referencia_externa: string
          token_temporario: string | null
          valor_estornado_centavos: number | null
          ultimo4_temporario: string | null
          updated_at: string
          valor_centavos: number
        }
        Insert: {
          ambiente: string
          asaas_cobranca_id?: string | null
          asaas_customer_id?: string | null
          asaas_estorno_id?: string | null
          bandeira_temporaria?: string | null
          claim_etapa?: string | null
          claim_expira_em?: string | null
          claim_token?: string | null
          cliente_id?: string | null
          created_at?: string
          erro_seguro?: string | null
          estorno_confirmado?: boolean
          estado?: string
          id?: string
          operacao_id: string
          referencia_externa: string
          token_temporario?: string | null
          valor_estornado_centavos?: number | null
          ultimo4_temporario?: string | null
          updated_at?: string
          valor_centavos: number
        }
        Update: {
          ambiente?: string
          asaas_cobranca_id?: string | null
          asaas_customer_id?: string | null
          asaas_estorno_id?: string | null
          bandeira_temporaria?: string | null
          claim_etapa?: string | null
          claim_expira_em?: string | null
          claim_token?: string | null
          cliente_id?: string | null
          created_at?: string
          erro_seguro?: string | null
          estorno_confirmado?: boolean
          estado?: string
          id?: string
          operacao_id?: string
          referencia_externa?: string
          token_temporario?: string | null
          valor_estornado_centavos?: number | null
          ultimo4_temporario?: string | null
          updated_at?: string
          valor_centavos?: number
        }
        Relationships: []
      }
      clientes_asaas: {
        Row: {
          ambiente: string
          asaas_customer_id: string | null
          claim_expira_em: string | null
          claim_token: string | null
          cliente_id: string
          created_at: string
          estado: string
          updated_at: string
        }
        Insert: {
          ambiente: string
          asaas_customer_id?: string | null
          claim_expira_em?: string | null
          claim_token?: string | null
          cliente_id: string
          created_at?: string
          estado?: string
          updated_at?: string
        }
        Update: {
          ambiente?: string
          asaas_customer_id?: string | null
          claim_expira_em?: string | null
          claim_token?: string | null
          cliente_id?: string
          created_at?: string
          estado?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      cliente_gestao_cartoes: { Args: never; Returns: string }
      registrar_gestao_cartao: {
        Args: {
          p_acao: string
          p_cartao_id: string
          p_cliente_id: string
          p_operacao_id: string
        }
        Returns: boolean
      }
      claim_cliente_asaas: { Args: { p_ambiente: string; p_cliente_id: string }; Returns: Json }
      finalizar_cliente_asaas: { Args: { p_ambiente: string; p_claim_token: string; p_cliente_id: string; p_customer_id: string }; Returns: Json }
      invalidar_cartao_operacao: { Args: { p_cartao_id: string; p_cliente_id: string; p_operacao_id: string }; Returns: Json }
      marcar_cliente_asaas_reconciliacao: { Args: { p_ambiente: string; p_claim_token?: string | null; p_cliente_id: string }; Returns: undefined }
      obter_cartao_operacao: { Args: { p_ambiente: string; p_cartao_id: string; p_cliente_id: string }; Returns: Json }
      obter_cliente_cartao: { Args: { p_cliente_id: string }; Returns: Json }
      registrar_operacao_cartao: {
        Args: { p_ambiente: string; p_cartao_salvo_id: string | null; p_cliente_id: string; p_contexto: string; p_operacao_id: string; p_salvar_cartao: boolean; p_tentativa_id: string | null }
        Returns: Json
      }
      salvar_token_operacao: { Args: { p_bandeira: string; p_customer_id: string; p_operacao_id: string; p_token: string; p_ultimo4: string }; Returns: Json }
      marcar_cartao_nao_salvo_reconciliacao: { Args: { p_tentativa_id: string }; Returns: Json }
      marcar_resposta_cobranca_perdida: { Args: { p_operacao_id: string }; Returns: Json }
      marcar_cartao_nao_salvo_service: { Args: { p_operacao_id: string }; Returns: Json }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
  public: {
    Tables: {
      clientes_cartoes: {
        Row: {
          ambiente: string
          asaas_credit_card_token: string
          asaas_customer_id: string
          bandeira: string
          cliente_id: string
          created_at: string
          id: string
          principal: boolean
          ultimo4: string
        }
        Insert: {
          ambiente: string
          asaas_credit_card_token: string
          asaas_customer_id: string
          bandeira: string
          cliente_id: string
          created_at?: string
          id?: string
          principal?: boolean
          ultimo4: string
        }
        Update: {
          ambiente?: string
          asaas_credit_card_token?: string
          asaas_customer_id?: string
          bandeira?: string
          cliente_id?: string
          created_at?: string
          id?: string
          principal?: boolean
          ultimo4?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_cartoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      "tentativas_pagamento": {
          Row: {
              "asaas_payment_id": string | null;
              "claim_expira_em": string | null;
              "claim_token": string | null;
              "cliente_id": string;
              "criado_em": string;
              "encerrada_em": string | null;
              "encerramento_claim_expira_em": string | null;
              "encerramento_claim_token": string | null;
              "encerramento_confirmacao": Json | null;
              "encerramento_operacao_id": string | null;
              "estado": string;
              "expira_em": string | null;
              "forma": string;
              "id": string;
              "operacao_id": string;
              "pedido_id": string;
              "pix_copia_e_cola": string | null;
              "qr_code_pix": string | null;
          };
          Insert: {
              "asaas_payment_id"?: string | null;
              "claim_expira_em"?: string | null;
              "claim_token"?: string | null;
              "cliente_id": string;
              "criado_em"?: string;
              "encerrada_em"?: string | null;
              "encerramento_claim_expira_em"?: string | null;
              "encerramento_claim_token"?: string | null;
              "encerramento_confirmacao"?: Json | null;
              "encerramento_operacao_id"?: string | null;
              "estado"?: string;
              "expira_em"?: string | null;
              "forma": string;
              "id"?: string;
              "operacao_id": string;
              "pedido_id": string;
              "pix_copia_e_cola"?: string | null;
              "qr_code_pix"?: string | null;
          };
          Update: {
              "asaas_payment_id"?: string | null;
              "claim_expira_em"?: string | null;
              "claim_token"?: string | null;
              "cliente_id"?: string;
              "criado_em"?: string;
              "encerrada_em"?: string | null;
              "encerramento_claim_expira_em"?: string | null;
              "encerramento_claim_token"?: string | null;
              "encerramento_confirmacao"?: Json | null;
              "encerramento_operacao_id"?: string | null;
              "estado"?: string;
              "expira_em"?: string | null;
              "forma"?: string;
              "id"?: string;
              "operacao_id"?: string;
              "pedido_id"?: string;
              "pix_copia_e_cola"?: string | null;
              "qr_code_pix"?: string | null;
          };
          Relationships: [
              {
                  foreignKeyName: "tentativas_pagamento_cliente_id_fkey";
                  columns: [
                      "cliente_id"
                  ];
                  isOneToOne: false;
                  referencedRelation: "clientes";
                  referencedColumns: [
                      "id"
                  ];
              },
              {
                  foreignKeyName: "tentativas_pagamento_pedido_id_fkey";
                  columns: [
                      "pedido_id"
                  ];
                  isOneToOne: false;
                  referencedRelation: "pedidos";
                  referencedColumns: [
                      "id"
                  ];
              }
          ];
      };
      account_deletion_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          delete_at: string
          failed_at: string | null
          failure_code: string | null
          id: string
          processing_at: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          delete_at?: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          processing_at?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          delete_at?: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          processing_at?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      clientes_estabelecimentos_favoritos: {
        Row: {
          cliente_id: string
          criado_em: string
          estabelecimento_id: string
        }
        Insert: {
          cliente_id: string
          criado_em?: string
          estabelecimento_id: string
        }
        Update: {
          cliente_id?: string
          criado_em?: string
          estabelecimento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_estabelecimentos_favoritos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_estabelecimentos_favoritos_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "carteira_lojista"
            referencedColumns: ["estabelecimento_id"]
          },
          {
            foreignKeyName: "clientes_estabelecimentos_favoritos_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_hubs_favoritos: {
        Row: {
          cliente_id: string
          criado_em: string
          hub_id: string
        }
        Insert: {
          cliente_id: string
          criado_em?: string
          hub_id: string
        }
        Update: {
          cliente_id?: string
          criado_em?: string
          hub_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_hubs_favoritos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_hubs_favoritos_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      estabelecimentos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          asaas_wallet_id: string | null
          atualizado_em: string
          categoria: string
          chave_pix: string | null
          chave_pix_tipo: string | null
          cnpj: string | null
          criado_em: string
          dados_receita: Json | null
          descricao: string | null
          dono_user_id: string | null
          endereco: string | null
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
          responsavel_nome: string | null
          status: string
          suspenso_em: string | null
          taxa_deslocamento_reais: number
          telefone: string | null
          tempo_medio_entrega_min: number
          ticket_minimo_reais: number | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          asaas_wallet_id?: string | null
          atualizado_em?: string
          categoria: string
          chave_pix?: string | null
          chave_pix_tipo?: string | null
          cnpj?: string | null
          criado_em?: string
          dados_receita?: Json | null
          descricao?: string | null
          dono_user_id?: string | null
          endereco?: string | null
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
          responsavel_nome?: string | null
          status?: string
          suspenso_em?: string | null
          taxa_deslocamento_reais?: number
          telefone?: string | null
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
          cotacao_id: string | null
          operacao_id: string | null
          forma_criacao: string | null
          aceito_em: string | null
          asaas_payment_id: string | null
          atualizado_em: string
          cancelado_em: string | null
          cliente_chegou_em: string | null
          cliente_id: string | null
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
          pix_copia_e_cola: string | null
          qr_code_pix: string | null
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
          cotacao_id?: string | null
          operacao_id?: string | null
          forma_criacao?: string | null
          aceito_em?: string | null
          asaas_payment_id?: string | null
          atualizado_em?: string
          cancelado_em?: string | null
          cliente_chegou_em?: string | null
          cliente_id?: string | null
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
          pix_copia_e_cola?: string | null
          qr_code_pix?: string | null
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
          cotacao_id?: string | null
          operacao_id?: string | null
          forma_criacao?: string | null
          aceito_em?: string | null
          asaas_payment_id?: string | null
          atualizado_em?: string
          cancelado_em?: string | null
          cliente_chegou_em?: string | null
          cliente_id?: string | null
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
          pix_copia_e_cola?: string | null
          qr_code_pix?: string | null
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
          separado: boolean
          separado_em: string | null
          subtotal_reais: number
          complementos_snapshot: Json
        }
        Insert: {
          id?: string
          nome_snapshot: string
          pedido_id: string
          preco_unitario_reais: number
          produto_id?: string | null
          quantidade: number
          separado?: boolean
          separado_em?: string | null
          subtotal_reais: number
          complementos_snapshot?: Json
        }
        Update: {
          id?: string
          nome_snapshot?: string
          pedido_id?: string
          preco_unitario_reais?: number
          produto_id?: string | null
          quantidade?: number
          separado?: boolean
          separado_em?: string | null
          subtotal_reais?: number
          complementos_snapshot?: Json
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
      produto_complemento_grupos: {
        Row: {
          id: string
          produto_id: string
          nome: string
          tipo: string
          min_selecoes: number
          max_selecoes: number
          ordem: number
        }
        Insert: {
          id?: string
          produto_id: string
          nome: string
          tipo: string
          min_selecoes: number
          max_selecoes: number
          ordem?: number
        }
        Update: {
          id?: string
          produto_id?: string
          nome?: string
          tipo?: string
          min_selecoes?: number
          max_selecoes?: number
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "produto_complemento_grupos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_complemento_itens: {
        Row: {
          id: string
          grupo_id: string
          nome: string
          preco_extra_reais: number
          ordem: number
        }
        Insert: {
          id?: string
          grupo_id: string
          nome: string
          preco_extra_reais?: number
          ordem?: number
        }
        Update: {
          id?: string
          grupo_id?: string
          nome?: string
          preco_extra_reais?: number
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "produto_complemento_itens_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "produto_complemento_grupos"
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
      estabelecimentos_publicos: {
        Row: {
          id: string
          nome_fantasia: string
          categoria: string
          descricao: string | null
          foto_fachada_url: string | null
          endereco: string
          lat: number | null
          lng: number | null
          raio_atendimento_km: number | null
          tempo_medio_entrega_min: number
          taxa_deslocamento_reais: number
          ticket_minimo_reais: number | null
          status: string
          pausado_manualmente: boolean
        }
        Relationships: []
      }
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
      claim_validacao_cartao_service: { Args: { p_etapa: string; p_operacao_id: string }; Returns: Json }
      claim_cliente_asaas_service: { Args: { p_ambiente: string; p_cliente_id: string }; Returns: Json }
      consultar_cadastro_cartao: { Args: { p_operacao_id: string }; Returns: Json }
      confirmar_estorno_validacao_cartao_service: { Args: { p_operacao_id: string }; Returns: Json }
      definir_cartao_principal: {
        Args: { p_cartao_id: string; p_operacao_id: string }
        Returns: {
          bandeira: string
          created_at: string
          id: string
          principal: boolean
          ultimo4: string
        }[]
      }
      listar_cartoes_cliente: {
        Args: never
        Returns: {
          bandeira: string
          created_at: string
          id: string
          principal: boolean
          ultimo4: string
        }[]
      }
      listar_pendencias_validacao_cartao_admin: {
        Args: never
        Returns: {
          operacao_id: string
          aberto_em: string
          estado: string
          erro_seguro: string | null
          referencia_externa: string
        }[]
      }
      processar_evento_validacao_cartao_service: { Args: { p_cobranca_id: string | null; p_evento: string; p_evento_id: string; p_metodo: string | null; p_referencia: string | null; p_valor_centavos: number | null }; Returns: Json }
      finalizar_cliente_asaas_service: { Args: { p_ambiente: string; p_claim_token: string; p_cliente_id: string; p_customer_id: string }; Returns: Json }
      finalizar_validacao_cartao_service: { Args: { p_operacao_id: string }; Returns: Json }
      falhar_validacao_cartao_service: { Args: { p_codigo: string; p_operacao_id: string }; Returns: Json }
      invalidar_cartao_operacao_service: { Args: { p_cartao_id: string; p_cliente_id: string; p_operacao_id: string }; Returns: Json }
      marcar_cliente_asaas_reconciliacao_service: { Args: { p_ambiente: string; p_claim_token?: string | null; p_cliente_id: string }; Returns: undefined }
      obter_cartao_operacao_service: { Args: { p_ambiente: string; p_cartao_id: string; p_cliente_id: string }; Returns: Json }
      obter_cliente_cartao_service: { Args: { p_cliente_id: string }; Returns: Json }
      obter_validacao_cartao_service: { Args: { p_operacao_id: string }; Returns: Json }
      registrar_cobranca_validacao_cartao_service: { Args: { p_cobranca_id: string; p_operacao_id: string }; Returns: Json }
      reconciliar_cobranca_validacao_cartao_service: { Args: { p_cobranca_id: string; p_operacao_id: string }; Returns: Json }
      registrar_estorno_validacao_cartao_service: { Args: { p_confirmado: boolean; p_estorno_id: string; p_operacao_id: string; p_valor_centavos: number }; Returns: Json }
      registrar_operacao_cartao_service: {
        Args: { p_ambiente: string; p_cartao_salvo_id: string | null; p_cliente_id: string; p_contexto: string; p_operacao_id: string; p_salvar_cartao: boolean; p_tentativa_id: string | null }
        Returns: Json
      }
      registrar_validacao_cartao_service: { Args: { p_ambiente: string; p_cliente_id: string; p_operacao_id: string; p_valor_centavos: number }; Returns: Json }
      salvar_token_validacao_cartao_service: { Args: { p_bandeira: string; p_customer_id: string; p_operacao_id: string; p_token: string; p_ultimo4: string }; Returns: Json }
      salvar_token_operacao_service: { Args: { p_bandeira: string; p_customer_id: string; p_operacao_id: string; p_token: string; p_ultimo4: string }; Returns: Json }
      marcar_cartao_nao_salvo_reconciliacao_service: { Args: { p_tentativa_id: string }; Returns: Json }
      marcar_resposta_cobranca_perdida_service: { Args: { p_operacao_id: string }; Returns: Json }
      vincular_cliente_asaas_recuperado_service: { Args: { p_ambiente: string; p_cliente_id: string; p_customer_id: string }; Returns: Json }
      remover_cartao_cliente: {
        Args: { p_cartao_id: string; p_operacao_id: string }
        Returns: {
          bandeira: string
          created_at: string
          id: string
          principal: boolean
          ultimo4: string
        }[]
      }
      obter_meu_estabelecimento_privado: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Tables"]["estabelecimentos"]["Row"][]
      }
      obter_estabelecimentos_privados: {
        Args: { p_id?: string | null }
        Returns: Database["public"]["Tables"]["estabelecimentos"]["Row"][]
      }
      estabelecimento_pertence_ao_usuario: {
        Args: { p_id: string }
        Returns: boolean
      }
      "preparar_encerramento_tentativa": {
          Args: {
              "p_operacao_id": string;
              "p_tentativa_id": string;
          };
          Returns: Json;
      };
      "claim_encerramento_tentativa": {
          Args: {
              "p_operacao_id": string;
              "p_tentativa_id": string;
          };
          Returns: Json;
      };
      "registrar_incerteza_encerramento": {
          Args: {
              "p_claim_token": string;
              "p_tentativa_id": string;
          };
          Returns: undefined;
      };
      "concluir_encerramento_tentativa": {
          Args: {
              "p_claim_token": string;
              "p_confirmacao": Json;
              "p_tentativa_id": string;
          };
          Returns: Json;
      };
      "criar_pedido_cotado": {
          Args: {
              "p_cotacao_id": string;
              "p_forma": string;
              "p_nf_solicitada": boolean;
              "p_operacao_id": string;
          };
          Returns: Json;
      };
      "reservar_tentativa_pagamento": {
          Args: {
              "p_forma": string;
              "p_operacao_id": string;
              "p_pedido_id": string;
          };
          Returns: Json;
      };
      "consultar_tentativa_pagamento": {
          Args: {
              "p_pedido_id": string;
          };
          Returns: Json;
      };
      "claim_tentativa_pagamento": {
          Args: {
              "p_tentativa_id": string;
          };
          Returns: Json;
      };
      "salvar_tentativa_pagamento": {
          Args: {
              "p_claim_token": string;
              "p_patch": Json;
              "p_tentativa_id": string;
          };
          Returns: Json;
      };
      "obter_pedido_pagamento": {
          Args: {
              "p_pedido_id": string;
          };
          Returns: Json;
      };
      obter_taxas: { Args: Record<PropertyKey, never>; Returns: Json }
      alterar_taxas: {
        Args: { p_comissao_bps: number; p_servico_centavos: number; p_versao_esperada: string; p_motivo: string; p_operacao_id: string }
        Returns: Json
      }
      listar_historico_taxas: { Args: Record<PropertyKey, never>; Returns: Json }
      cotar_pedido: {
        Args: { p_estabelecimento_id: string; p_hub_id: string; p_itens: Json }
        Returns: Json
      }
      obter_pin_cliente: {
        Args: { p_pedido_id: string }
        Returns: string
      }
      pedido_cliente_nome: {
        Args: { pedido: Database["public"]["Tables"]["pedidos"]["Row"] }
        Returns: string
      }
      aceitar_pedido: {
        Args: { p_pedido_id: string; p_tempo_estimado_min: number }
        Returns: string
      }
      aprovar_lojista: { Args: { p_estab_id: string }; Returns: string }
      aprovar_lojista_com_hubs: {
        Args: { p_estabelecimento_id: string; p_hub_ids: string[]; p_operacao_id: string }
        Returns: undefined
      }
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
      cancel_account_deletion_request: {
        Args: { p_user_id: string }
        Returns: {
          delete_at: string
          requested_at: string
          status: string
        }[]
      }
      apply_account_deletion_data: {
        Args: {
          p_generation: number
          p_lease_token: string
          p_request_id: string
        }
        Returns: Json
      }
      expire_account_deletion_retention: {
        Args: { p_limit: number }
        Returns: Json
      }
      list_account_deletion_files: {
        Args: {
          p_generation: number
          p_lease_token: string
          p_limit: number
          p_request_id: string
        }
        Returns: Json[]
      }
      ack_account_deletion_files: {
        Args: {
          p_file_ids: string[]
          p_generation: number
          p_lease_token: string
          p_request_id: string
        }
        Returns: undefined
      }
      advance_account_deletion: {
        Args: {
          p_generation: number
          p_lease_token: string
          p_phase: string
          p_request_id: string
        }
        Returns: undefined
      }
      complete_account_deletion: {
        Args: { p_generation: number; p_lease_token: string; p_request_id: string }
        Returns: Json
      }
      reload_account_deletion: {
        Args: { p_generation: number; p_lease_token: string; p_request_id: string }
        Returns: Json
      }
      fail_account_deletion: {
        Args: { p_code: string; p_generation: number; p_lease_token: string; p_request_id: string }
        Returns: undefined
      }
      // Bloco 10 (Story 6.21) — RPC nova
      // (20260814000003_rpc_cancelar_pedido_atraso.sql). Retorna só o `uuid`
      // do pedido; os 3 efeitos (status/refund/falha) são atômicos na RPC,
      // mas não fazem parte do retorno da função.
      cancelar_pedido_atraso: {
        Args: { p_pedido_id: string }
        Returns: string
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
      confirmar_pagamento_pedido: {
        Args: { p_asaas_payment_id: string; p_external_reference?: string | null }
        Returns: { resultado: string; pedido_id: string | null }[]
      }
      confirmar_pin_pedido: {
        Args: { p_pedido_id: string; p_pin: string }
        Returns: {
          bloqueado_ate: string
          resultado: string
          tentativas_restantes: number
        }[]
      }
      definir_hubs_lojista: {
        Args: { p_estabelecimento_id: string; p_hub_ids: string[]; p_operacao_id: string }
        Returns: undefined
      }
      inspecionar_pagamento_admin: {
        Args: { p_pedido_id: string }
        Returns: Json
      }
      resolver_chargeback_admin: {
        Args: {
          p_ocorrencia_id: string
          p_responsavel_principal: string
          p_motivo: string
          p_referencia: string
          p_principal_centavos: number
          p_operacao_id: string
        }
        Returns: Json
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
      // Bloco 10 (Story 6.20, pré-requisito) — RPC nova
      // (20260814000001_pedidos_add_cliente_chegou_em.sql). Retorna só o
      // `uuid` do pedido (mesmo padrão de `aceitar_pedido`).
      marcar_cliente_chegou: {
        Args: { p_pedido_id: string }
        Returns: string
      }
      marcar_item_separado_pedido: {
        Args: { p_item_id: string; p_separado: boolean }
        Returns: string
      }
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
      // Bloco 10 (Story 6.11) — RPC nova
      // (20260814000000_rpc_recusar_pedido.sql). Retorna só o `uuid` do
      // pedido (mesmo padrão de `aceitar_pedido`); o refund 100% é inserido
      // na MESMA transação, mas não faz parte do retorno da função.
      recusar_pedido: {
        Args: { p_motivo: string; p_pedido_id: string }
        Returns: string
      }
      // Story 7.11 — RPC nova (20260814000006_rpc_registrar_chargeback_pedido.sql).
      // Chamada só pela Edge Function asaas-payment-webhook (service_role),
      // evento PAYMENT_CHARGEBACK_REQUESTED. Mesmo padrão de
      // confirmar_pagamento_pedido (7.5).
      registrar_chargeback_pedido: {
        Args: { p_asaas_payment_id: string; p_external_reference?: string | null }
        Returns: { resultado: string; pedido_id: string | null }[]
      }
      rejeitar_lojista: {
        Args: { p_estab_id: string; p_motivo: string }
        Returns: string
      }
      // Bloco 10 (Story 6.20) — RPC nova
      // (20260814000002_rpc_reportar_lojista_nao_veio.sql). Retorna só o
      // `uuid` do pedido; os 3 efeitos (status/refund/falha) são atômicos na
      // RPC, mas não fazem parte do retorno da função.
      reportar_lojista_nao_veio: {
        Args: { p_pedido_id: string }
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
  private: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

/** Public RPC projection; database token/customer fields never enter the app contract. */
export type SavedCardSummary = Database["public"]["Functions"]["listar_cartoes_cliente"]["Returns"][number]
