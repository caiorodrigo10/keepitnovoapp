# Data Models — Schema Completo Supabase

**Autor:** @architect (Aria)
**Data:** 2026-07-02
**Escopo:** Modelo de dados formal do Keepit MVP para PostgreSQL/Supabase. Base para as migrations em `apps/supabase/migrations/`.

Este documento é normativo. Toda mudança de schema em produção passa por nova migration + atualização deste documento.

## Convenções

- **PostgreSQL 15+** (Supabase managed).
- **Snake_case** em nomes de tabelas, colunas, índices, constraints.
- **Chaves primárias**: `uuid` gerado por `gen_random_uuid()` (extensão `pgcrypto`). Exceção: tabelas de junção pura podem usar chave composta.
- **Timestamps**: `timestamptz` (com timezone). Toda tabela tem `criado_em timestamptz DEFAULT NOW() NOT NULL`. Tabelas mutáveis adicionam `atualizado_em timestamptz DEFAULT NOW() NOT NULL` + trigger `update_atualizado_em`.
- **Valores monetários**: `numeric(10,2)` — reais com centavos. Nunca `float`.
- **Enums**: preferimos `text` com CHECK constraint em vez de `CREATE TYPE ... AS ENUM` (mais flexível para migrations).
- **Nomes plurais** em tabelas: `clientes`, `pedidos`, `hubs`.
- **Foreign keys** sempre com `ON DELETE` explícito (`RESTRICT` por padrão; `CASCADE` só quando semanticamente correto).
- **Soft delete**: usamos `excluido_em timestamptz NULL` em vez de deletar linha, para tabelas com histórico relevante (produtos, estabelecimentos, clientes).

## Extensões PostgreSQL utilizadas

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid, digest, crypt
CREATE EXTENSION IF NOT EXISTS "pg_cron";      -- jobs (timeout aceite, atraso lojista)
CREATE EXTENSION IF NOT EXISTS "pgsodium";     -- criptografia at-rest da chave PIX
CREATE EXTENSION IF NOT EXISTS "postgis";      -- OPCIONAL para geo — MVP usa Haversine em Edge Function
```

**Nota:** no MVP não usamos PostGIS. Distância é calculada por Haversine em Edge Function TypeScript. PostGIS entra se houver muitos hubs e a query ficar lenta.

## Trigger utilitário compartilhado

```sql
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Aplicado nas tabelas mutáveis via `CREATE TRIGGER trg_{tabela}_atualizado BEFORE UPDATE ON {tabela} FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();`

## Diagrama ER (visão macro)

```
auth.users (Supabase Auth)
├── clientes (1:1)
│   ├── clientes_confirmacao_telefone (1:N — histórico)
│   ├── clientes_cartoes (1:N)
│   └── carrinho (1:N por estabelecimento)
│       └── carrinho_itens (1:N)
├── estabelecimentos (1:1 dono)
│   ├── estabelecimentos_horarios (1:N — 7 dias)
│   ├── estabelecimentos_falhas (1:N)
│   ├── produtos (1:N)
│   └── saques (1:N)
└── admin_users (1:1)

hubs (independente)
└── hubs_horarios (1:N — 7 dias)

pedidos (referencia cliente + estabelecimento + hub)
├── pedidos_itens (1:N — snapshot dos itens no momento da compra)
├── reembolsos_pendentes (1:1 opcional)
├── chargebacks (1:N — raros mas mais de um por pedido é possível)
└── debitos_lojista (1:N — chargebacks + outros)

VIEW carteira_lojista (calculada de pedidos + saques + debitos)
```

---

## 1. Identidade e Auth

### 1.1 `clientes`

Espelha `auth.users` para dados de perfil do cliente. Criado via trigger em `auth.users`.

```sql
CREATE TABLE clientes (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text NOT NULL,
  telefone_confirmado boolean NOT NULL DEFAULT false,
  cpf text,                                          -- só no primeiro checkout
  expo_push_token text,
  notificacoes_ativas boolean NOT NULL DEFAULT true,
  bloqueado boolean NOT NULL DEFAULT false,
  motivo_bloqueio text,
  hub_padrao_id uuid,                                -- reservado para v2 ("hub favorito"); no MVP fica NULL
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  atualizado_em timestamptz NOT NULL DEFAULT NOW(),
  excluido_em timestamptz
);

CREATE INDEX idx_clientes_telefone ON clientes(telefone);
CREATE INDEX idx_clientes_cpf ON clientes(cpf) WHERE cpf IS NOT NULL;
CREATE INDEX idx_clientes_bloqueado ON clientes(bloqueado) WHERE bloqueado = true;
```

**Trigger de sincronização** (criar em `auth.users` → cria em `clientes`):

```sql
CREATE OR REPLACE FUNCTION criar_cliente_apos_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO clientes (id, nome, telefone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    COALESCE(NEW.raw_user_meta_data->>'telefone', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_criar_cliente_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION criar_cliente_apos_signup();
```

### 1.2 `clientes_confirmacao_telefone`

Códigos SMS enviados via Zenvia.

```sql
CREATE TABLE clientes_confirmacao_telefone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  codigo_hash text NOT NULL,                         -- crypt() do código
  telefone text NOT NULL,                            -- snapshot para auditoria
  tentativas int NOT NULL DEFAULT 0,
  expira_em timestamptz NOT NULL,                    -- 10 min após criação
  consumido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conf_tel_cliente ON clientes_confirmacao_telefone(cliente_id, criado_em DESC);
CREATE INDEX idx_conf_tel_ativos ON clientes_confirmacao_telefone(cliente_id)
  WHERE consumido_em IS NULL;
```

**Rate limit** (implementado em Edge Function): máximo 3 códigos por telefone por hora.

### 1.3 `clientes_cartoes`

Cartões salvos (tokenizados no Asaas — nunca armazenamos PAN).

```sql
CREATE TABLE clientes_cartoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  asaas_credit_card_token text NOT NULL,             -- opaco, vem do Asaas
  ultimo4 text NOT NULL CHECK (length(ultimo4) = 4),
  bandeira text NOT NULL,                            -- 'VISA', 'MASTERCARD', etc.
  nome_no_cartao text NOT NULL,
  padrao boolean NOT NULL DEFAULT false,             -- cartão preferido
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  excluido_em timestamptz
);

CREATE INDEX idx_cartoes_cliente ON clientes_cartoes(cliente_id)
  WHERE excluido_em IS NULL;

-- Garante 1 padrão por cliente
CREATE UNIQUE INDEX idx_cartoes_padrao_unico
  ON clientes_cartoes(cliente_id)
  WHERE padrao = true AND excluido_em IS NULL;
```

### 1.4 `estabelecimentos`

Um estabelecimento por dono (`1 conta = 1 estabelecimento` no MVP).

```sql
CREATE TABLE estabelecimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dono_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Dados básicos
  nome_fantasia text NOT NULL,
  cnpj text NOT NULL UNIQUE,
  responsavel_nome text NOT NULL,
  telefone text NOT NULL,
  categoria text NOT NULL,                           -- 'farmacia', 'alimentacao', 'vestuario', ...
  descricao text,
  foto_fachada_url text,
  dados_receita jsonb,                               -- cache do retorno BrasilAPI

  -- Operacional
  endereco text NOT NULL,
  lat numeric(9,6) NOT NULL,
  lng numeric(9,6) NOT NULL,
  raio_atendimento_km numeric(4,1) NOT NULL CHECK (raio_atendimento_km > 0 AND raio_atendimento_km <= 30),
  tempo_medio_entrega_min int NOT NULL CHECK (tempo_medio_entrega_min BETWEEN 5 AND 240),
  taxa_deslocamento_reais numeric(6,2) NOT NULL DEFAULT 0 CHECK (taxa_deslocamento_reais >= 0),
  ticket_minimo_reais numeric(10,2),                 -- NULL = usa global R$ 20

  -- Financeiro
  chave_pix text NOT NULL,
  chave_pix_tipo text NOT NULL CHECK (chave_pix_tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  asaas_wallet_id text,                              -- preenchido na aprovação
  asaas_api_key_encrypted bytea,                     -- pgsodium encrypted

  -- Estado
  status text NOT NULL DEFAULT 'em_analise'
    CHECK (status IN ('em_analise', 'ativo', 'rejeitado', 'suspenso')),
  motivo_rejeicao text,
  motivo_suspensao text,
  pausado_manualmente boolean NOT NULL DEFAULT false,

  aprovado_em timestamptz,
  aprovado_por uuid REFERENCES auth.users(id),
  suspenso_em timestamptz,

  criado_em timestamptz NOT NULL DEFAULT NOW(),
  atualizado_em timestamptz NOT NULL DEFAULT NOW(),
  excluido_em timestamptz
);

CREATE INDEX idx_estab_status ON estabelecimentos(status);
CREATE INDEX idx_estab_categoria ON estabelecimentos(categoria) WHERE status = 'ativo';
CREATE INDEX idx_estab_geo ON estabelecimentos(lat, lng) WHERE status = 'ativo' AND pausado_manualmente = false;
CREATE INDEX idx_estab_cnpj ON estabelecimentos(cnpj);
```

### 1.5 `estabelecimentos_horarios`

7 linhas por estabelecimento (uma por dia da semana).

```sql
CREATE TABLE estabelecimentos_horarios (
  estabelecimento_id uuid NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=domingo, 6=sábado
  aberto boolean NOT NULL DEFAULT false,
  hora_abre time,                                    -- NULL se aberto = false
  hora_fecha time,                                   -- NULL se aberto = false
  PRIMARY KEY (estabelecimento_id, dia_semana),
  CHECK (aberto = false OR (hora_abre IS NOT NULL AND hora_fecha IS NOT NULL AND hora_abre < hora_fecha))
);
```

### 1.6 `estabelecimentos_falhas`

Registro de falhas de qualidade (no-show do lojista, atraso, etc.).

```sql
CREATE TABLE estabelecimentos_falhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_id uuid NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
  pedido_id uuid REFERENCES pedidos(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('lojista_nao_apareceu', 'atraso_grave', 'chargeback', 'reclamacao_admin')),
  detalhes text,
  criado_em timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_falhas_estab_data ON estabelecimentos_falhas(estabelecimento_id, criado_em DESC);
```

### 1.7 `admin_users`

Simples flag: se você existe aqui, é admin da Keepit.

```sql
CREATE TABLE admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT NOW()
);
```

**Função utilitária:**

```sql
CREATE OR REPLACE FUNCTION is_admin(user_id uuid DEFAULT auth.uid())
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE id = user_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

Uso: `WHERE is_admin() OR ...` nas policies RLS.

---

## 2. Localização (Hubs)

### 2.1 `hubs`

```sql
CREATE TABLE hubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  endereco text NOT NULL,
  lat numeric(9,6) NOT NULL,
  lng numeric(9,6) NOT NULL,
  ponto_referencia text,                             -- descrição operacional livre
  foto_url text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  atualizado_em timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hubs_ativo ON hubs(ativo) WHERE ativo = true;
CREATE INDEX idx_hubs_geo ON hubs(lat, lng) WHERE ativo = true;
```

### 2.2 `hubs_horarios`

```sql
CREATE TABLE hubs_horarios (
  hub_id uuid NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  aberto boolean NOT NULL DEFAULT false,
  hora_abre time,
  hora_fecha time,
  PRIMARY KEY (hub_id, dia_semana),
  CHECK (aberto = false OR (hora_abre IS NOT NULL AND hora_fecha IS NOT NULL AND hora_abre < hora_fecha))
);
```

---

## 3. Catálogo (Produtos)

### 3.1 `produtos`

```sql
CREATE TABLE produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_id uuid NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  preco_reais numeric(10,2) NOT NULL CHECK (preco_reais > 0),
  categoria_produto text NOT NULL,                   -- 'cuidados', 'higiene', 'alimentos', etc.
  foto_url text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  atualizado_em timestamptz NOT NULL DEFAULT NOW(),
  excluido_em timestamptz
);

CREATE INDEX idx_produtos_estab ON produtos(estabelecimento_id)
  WHERE excluido_em IS NULL;
CREATE INDEX idx_produtos_categoria ON produtos(categoria_produto)
  WHERE ativo = true AND excluido_em IS NULL;

-- Índice trigram para busca por nome
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE INDEX idx_produtos_nome_trgm ON produtos USING gin(nome gin_trgm_ops)
  WHERE ativo = true AND excluido_em IS NULL;
```

**Não há tabela de estoque.** Decisão de negócio: lojista administra estoque fora do app.

---

## 4. Carrinho

### 4.1 `carrinho`

Um carrinho por cliente por estabelecimento. Tentativa de adicionar item de outra loja alerta e limpa.

```sql
CREATE TABLE carrinho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  estabelecimento_id uuid NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
  atualizado_em timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id, estabelecimento_id)
);

CREATE INDEX idx_carrinho_cliente ON carrinho(cliente_id);
```

### 4.2 `carrinho_itens`

```sql
CREATE TABLE carrinho_itens (
  carrinho_id uuid NOT NULL REFERENCES carrinho(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade int NOT NULL CHECK (quantidade > 0),
  preco_snapshot_reais numeric(10,2) NOT NULL,       -- congela preço no momento de add
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (carrinho_id, produto_id)
);
```

---

## 5. Pedido & PIN

### 5.1 `pedidos`

Tabela central do sistema.

```sql
CREATE TABLE pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero serial NOT NULL UNIQUE,                     -- número humano-amigável tipo #2048

  -- Relações
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  estabelecimento_id uuid NOT NULL REFERENCES estabelecimentos(id) ON DELETE RESTRICT,
  hub_id uuid NOT NULL REFERENCES hubs(id) ON DELETE RESTRICT,

  -- Estado
  status text NOT NULL DEFAULT 'aguardando_pagamento'
    CHECK (status IN (
      'aguardando_pagamento',
      'aguardando_aceite',
      'aceito',
      'em_preparo',
      'saindo_hub',
      'no_hub',
      'entregue',
      'cancelado',
      'cancelado_timeout',
      'cancelado_atraso',
      'cancelado_admin',
      'recusado',
      'nao_retirado',
      'nao_entregue_lojista',
      'estornado_chargeback'
    )),

  -- PIN
  pin_hash text NOT NULL,                            -- pgcrypto crypt() do PIN
  pin_texto text NOT NULL,                           -- texto plano (só para exibir ao cliente)
  tentativas_pin int NOT NULL DEFAULT 0,
  pin_bloqueado_ate timestamptz,

  -- Timing
  tempo_estimado_min int,                            -- informado no aceite
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  pago_em timestamptz,
  aceito_em timestamptz,
  saiu_hub_em timestamptz,
  cliente_chegou_em timestamptz,
  lojista_chegou_em timestamptz,
  entregue_em timestamptz,                           -- <-- gatilho da carteira (D+7)
  cancelado_em timestamptz,

  -- Financeiro (snapshot no momento da compra)
  subtotal_produtos_reais numeric(10,2) NOT NULL,
  taxa_deslocamento_reais numeric(10,2) NOT NULL,
  taxa_keepit_reais numeric(10,2) NOT NULL,          -- 12% do subtotal
  total_pago_reais numeric(10,2) NOT NULL,           -- subtotal + deslocamento

  -- Meta
  nf_solicitada boolean NOT NULL DEFAULT false,
  motivo_recusa text,
  motivo_cancelamento text,
  motivo_nao_retirado text,

  -- Pagamento
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('pix', 'cartao')),
  asaas_payment_id text UNIQUE,
  qr_code_pix text,
  pix_copia_e_cola text,

  atualizado_em timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id, criado_em DESC);
CREATE INDEX idx_pedidos_estab ON pedidos(estabelecimento_id, criado_em DESC);
CREATE INDEX idx_pedidos_hub ON pedidos(hub_id, criado_em DESC);
CREATE INDEX idx_pedidos_status ON pedidos(status);
CREATE INDEX idx_pedidos_asaas ON pedidos(asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;

-- Índice crítico para carteira do lojista
CREATE INDEX idx_pedidos_entregue_estab
  ON pedidos(estabelecimento_id, entregue_em)
  WHERE status = 'entregue' AND entregue_em IS NOT NULL;

-- Job de timeout precisa desse índice
CREATE INDEX idx_pedidos_aguardando_aceite
  ON pedidos(criado_em)
  WHERE status = 'aguardando_aceite';
```

### 5.2 `pedidos_itens`

Snapshot dos itens no momento do checkout (não FK direto ao `produtos` para preservar o histórico se produto for editado/excluído).

```sql
CREATE TABLE pedidos_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES produtos(id) ON DELETE SET NULL,    -- pode virar NULL se produto deletado
  nome_snapshot text NOT NULL,                       -- congela nome
  preco_unitario_reais numeric(10,2) NOT NULL,
  quantidade int NOT NULL CHECK (quantidade > 0),
  subtotal_reais numeric(10,2) NOT NULL              -- preco * quantidade
);

CREATE INDEX idx_pedidos_itens_pedido ON pedidos_itens(pedido_id);
```

---

## 6. Financeiro

### 6.1 `reembolsos_pendentes`

Fila de reembolsos manuais (Rodada 6 - regra explícita do MVP).

```sql
CREATE TABLE reembolsos_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
  motivo text NOT NULL CHECK (motivo IN (
    'timeout_aceite',
    'recusa_lojista',
    'cancelamento_cliente_pre_aceite',
    'cancelamento_cliente_pos_aceite',
    'cancelamento_atraso',
    'nao_retirado_cliente',
    'nao_entregue_lojista',
    'chargeback',
    'cancelamento_admin'
  )),
  valor_a_estornar_reais numeric(10,2) NOT NULL CHECK (valor_a_estornar_reais >= 0),
  valor_ao_lojista_reais numeric(10,2) NOT NULL DEFAULT 0 CHECK (valor_ao_lojista_reais >= 0),
  forma_pagamento text NOT NULL,
  status text NOT NULL DEFAULT 'pendente_admin'
    CHECK (status IN ('pendente_admin', 'em_processamento', 'estornado', 'erro')),
  erro_detalhe text,
  processado_por uuid REFERENCES auth.users(id),
  processado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  atualizado_em timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reembolsos_pendentes ON reembolsos_pendentes(status, criado_em)
  WHERE status = 'pendente_admin';
CREATE INDEX idx_reembolsos_pedido ON reembolsos_pendentes(pedido_id);
```

### 6.2 `saques`

Solicitações de saque do lojista.

```sql
CREATE TABLE saques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_id uuid NOT NULL REFERENCES estabelecimentos(id) ON DELETE RESTRICT,
  valor_reais numeric(10,2) NOT NULL CHECK (valor_reais >= 200),
  status text NOT NULL DEFAULT 'solicitado'
    CHECK (status IN ('solicitado', 'processando', 'concluido', 'erro')),
  asaas_transfer_id text UNIQUE,
  erro_detalhe text,
  solicitado_em timestamptz NOT NULL DEFAULT NOW(),
  processado_em timestamptz,
  concluido_em timestamptz
);

CREATE INDEX idx_saques_estab ON saques(estabelecimento_id, solicitado_em DESC);
CREATE INDEX idx_saques_status ON saques(status);
```

### 6.3 `chargebacks`

Registro de chargebacks recebidos via webhook Asaas.

```sql
CREATE TABLE chargebacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
  valor_reais numeric(10,2) NOT NULL,
  asaas_event_id text UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT NOW()
);
```

### 6.4 `debitos_lojista`

Débitos que afetam a carteira virtual (taxa de chargeback, ajustes manuais admin).

```sql
CREATE TABLE debitos_lojista (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_id uuid NOT NULL REFERENCES estabelecimentos(id) ON DELETE RESTRICT,
  motivo text NOT NULL CHECK (motivo IN ('taxa_chargeback', 'ajuste_admin')),
  valor_reais numeric(10,2) NOT NULL CHECK (valor_reais > 0),
  pedido_id uuid REFERENCES pedidos(id),
  detalhe text,
  criado_por uuid REFERENCES auth.users(id),         -- admin que criou (se ajuste manual)
  criado_em timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_debitos_estab ON debitos_lojista(estabelecimento_id, criado_em DESC);
```

### 6.5 View `carteira_lojista`

Coração do modelo de carteira virtual.

```sql
CREATE OR REPLACE VIEW carteira_lojista AS
WITH creditos AS (
  -- Pedidos entregues, líquido de taxa Keepit
  SELECT
    estabelecimento_id,
    entregue_em,
    (subtotal_produtos_reais - taxa_keepit_reais + taxa_deslocamento_reais) AS valor_liquido_reais
  FROM pedidos
  WHERE status = 'entregue' AND entregue_em IS NOT NULL
),
saldo_disponivel AS (
  SELECT
    estabelecimento_id,
    COALESCE(SUM(valor_liquido_reais), 0) AS total
  FROM creditos
  WHERE entregue_em <= NOW() - INTERVAL '7 days'
  GROUP BY estabelecimento_id
),
saldo_bloqueado AS (
  SELECT
    estabelecimento_id,
    COALESCE(SUM(valor_liquido_reais), 0) AS total
  FROM creditos
  WHERE entregue_em > NOW() - INTERVAL '7 days'
  GROUP BY estabelecimento_id
),
saques_feitos AS (
  SELECT
    estabelecimento_id,
    COALESCE(SUM(valor_reais), 0) AS total
  FROM saques
  WHERE status IN ('solicitado', 'processando', 'concluido')  -- inclui solicitados para evitar overdraw
  GROUP BY estabelecimento_id
),
debitos AS (
  SELECT
    estabelecimento_id,
    COALESCE(SUM(valor_reais), 0) AS total
  FROM debitos_lojista
  GROUP BY estabelecimento_id
)
SELECT
  e.id AS estabelecimento_id,
  COALESCE(sd.total, 0) - COALESCE(sf.total, 0) - COALESCE(db.total, 0) AS saldo_disponivel_reais,
  COALESCE(sb.total, 0) AS saldo_bloqueado_reais,
  COALESCE(sf.total, 0) AS total_sacado_reais,
  COALESCE(db.total, 0) AS total_debitado_reais
FROM estabelecimentos e
LEFT JOIN saldo_disponivel sd ON sd.estabelecimento_id = e.id
LEFT JOIN saldo_bloqueado sb ON sb.estabelecimento_id = e.id
LEFT JOIN saques_feitos sf ON sf.estabelecimento_id = e.id
LEFT JOIN debitos db ON db.estabelecimento_id = e.id
WHERE e.status = 'ativo';
```

**Nota importante:** saldo pode ficar negativo se chargeback for maior que crédito. Isso é esperado (regra: lojista fica devedor). O check `saques.valor_reais >= 200` protege contra saque sob saldo insuficiente; validação real é feita em Edge Function que lê a view.

---

## 7. Jobs `pg_cron`

### 7.1 Timeout de aceite (10 min)

```sql
SELECT cron.schedule(
  'timeout-aceite',
  '* * * * *',   -- a cada minuto
  $$
    UPDATE pedidos
    SET status = 'cancelado_timeout',
        cancelado_em = NOW(),
        atualizado_em = NOW()
    WHERE status = 'aguardando_aceite'
      AND criado_em < NOW() - INTERVAL '10 minutes';

    -- Também insere na fila de reembolso para cada um
    INSERT INTO reembolsos_pendentes (pedido_id, motivo, valor_a_estornar_reais, forma_pagamento)
    SELECT id, 'timeout_aceite', total_pago_reais, forma_pagamento
    FROM pedidos
    WHERE status = 'cancelado_timeout'
      AND cancelado_em >= NOW() - INTERVAL '2 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM reembolsos_pendentes r WHERE r.pedido_id = pedidos.id
      );
  $$
);
```

### 7.2 Aviso de atraso do lojista (2x tempo médio)

```sql
SELECT cron.schedule(
  'aviso-atraso-lojista',
  '* * * * *',
  $$
    -- Marca pedidos atrasados para envio de push (Edge Function separada consome esta flag)
    UPDATE pedidos
    SET atrasado_notificado = true
    WHERE status IN ('aceito', 'em_preparo')
      AND aceito_em + (tempo_estimado_min * 2 || ' minutes')::interval < NOW()
      AND atrasado_notificado = false;
  $$
);
```

**Adicionar coluna:** `pedidos.atrasado_notificado boolean NOT NULL DEFAULT false`.

---

## 8. Convenções de migration

Cada arquivo em `apps/supabase/migrations/` segue o padrão:

```
{timestamp}_{descricao_curta}.sql

Ex:
20260702120000_init_schema.sql
20260702130000_criar_indices_geo.sql
20260710091500_add_atrasado_notificado.sql
```

Ordem sugerida do schema inicial:
1. Extensões
2. Trigger utilitário `set_atualizado_em`
3. `admin_users` + função `is_admin()`
4. `clientes` + trigger de signup
5. `clientes_confirmacao_telefone`
6. `estabelecimentos` + horários + falhas
7. `hubs` + horários
8. `produtos`
9. `carrinho` + itens
10. `pedidos` + itens
11. `reembolsos_pendentes`, `saques`, `chargebacks`, `debitos_lojista`
12. View `carteira_lojista`
13. `clientes_cartoes`
14. Jobs pg_cron

Ver `docs/architecture/05-security.md` para as políticas RLS de cada tabela.
