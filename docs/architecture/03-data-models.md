# Data Models — Schema Completo Supabase

> **Uso no piloto (2026-07-31):** este schema permanece como modelo-alvo e não
> foi descartado. As migrations devem introduzir somente as tabelas/colunas
> necessárias às Stories `CORE` e `SIMPLE` da rodada atual, seguindo
> [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md). `pg_cron`, Haversine e
> estruturas exclusivas de cartão/chargeback não bloqueiam o piloto.

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
CREATE EXTENSION IF NOT EXISTS "pg_cron";      -- pós-piloto: jobs de timeout/atraso
CREATE EXTENSION IF NOT EXISTS "pgsodium";     -- pós-piloto: cripto at-rest da chave Asaas por lojista
CREATE EXTENSION IF NOT EXISTS "postgis";      -- OPCIONAL para geo — MVP usa Haversine em Edge Function
```

**Nota:** no piloto não usamos PostGIS nem Haversine. A escolha do hub é por
lista e a relação loja↔hub é explícita. Geolocalização volta quando o número de
hubs justificar.

**Nota (2026-08-12):** no piloto **não usamos `pgsodium`**. A criptografia
at-rest existia para guardar uma chave/subconta Asaas **por estabelecimento**;
o piloto opera com **uma conta Asaas única da Keepit**, cuja chave vive apenas
no ambiente server-side (env da Edge Function `create-pix-payment`), nunca no
banco. Ver Story 3.8 (`SIMPLE`: aprovar lojista sem criação automática de
subconta Asaas) e o overlay [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md).
`pgsodium` volta quando cada lojista tiver subconta própria (gatilho: repasse
automático/subconta em 07 §"Gatilhos para aumentar complexidade"). A extensão
permanece listada por rastreabilidade do modelo-alvo; **não é criada nas
migrations do piloto**.

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
│   ├── clientes_cartoes (1:N)
│   └── carrinho (1:N por estabelecimento)
│       └── carrinho_itens (1:N)
├── estabelecimentos (1:1 dono)
│   ├── estabelecimentos_horarios (1:N — 7 dias)
│   ├── estabelecimentos_falhas (1:N)
│   ├── estabelecimentos_hubs (1:N — hubs que esta loja atende)
│   ├── produtos (1:N)
│   └── lancamentos_financeiros (1:N — ledger financeiro do piloto)
└── admin_users (1:1)

hubs (independente)
├── hubs_horarios (1:N — 7 dias)
└── estabelecimentos_hubs (1:N — lojas que aparecem ao escolher este hub)

estabelecimentos_hubs (N:N loja↔hub — junção; base da descoberta por lista, sem geo)

pedidos (referencia cliente + estabelecimento + hub)
├── pedidos_itens (1:N — snapshot dos itens no momento da compra)
└── lancamentos_financeiros (1:N — charge/platform_fee/merchant_credit/refund/payout)

VIEW carteira_lojista (agregação SUM/CASE sobre lancamentos_financeiros)

Modelo-alvo pós-piloto (NÃO aplicado nas migrations do piloto — ver §6):
  reembolsos_pendentes, saques, debitos_lojista, chargebacks
```

---

## 1. Identidade e Auth

### 1.1 `clientes`

Espelha `auth.users` para dados de perfil do cliente. Criado via trigger em `auth.users`.

> **Reconciliado com a decisão 10.4 (2026-07-29):** autenticação do Cliente é **e-mail + senha** (Supabase Auth nativo), **sem SMS no MVP**. Consequências neste schema: (a) `telefone` é **nullable** (campo opcional no cadastro); (b) a coluna `telefone_confirmado` **saiu** — o telefone não é verificado; (c) a tabela `clientes_confirmacao_telefone` saiu do MVP (ver 1.2).
> Este bloco é a fonte de verdade do DDL e **bate com a Story 2.3 do Épico 2** (`docs/prd/epics/2-auth-cliente.md`), que define o subconjunto mínimo criado na migration do Épico 2 (`id`, `nome`, `telefone` nullable, `cpf` nullable, `criado_em`). As demais colunas abaixo pertencem a épicos posteriores (push, bloqueio, soft delete) e entram por migrations incrementais.

```sql
CREATE TABLE clientes (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,                                     -- opcional e NÃO verificado (decisão 10.4)
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

-- Índice parcial: telefone virou nullable com a 10.4 e a maioria das linhas pode ficar NULL.
-- Uso restante: busca administrativa de cliente por telefone no painel. Não há mais lookup por
-- telefone em fluxo de autenticação (o SMS saiu do MVP).
CREATE INDEX idx_clientes_telefone ON clientes(telefone) WHERE telefone IS NOT NULL;
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
    NULLIF(NEW.raw_user_meta_data->>'telefone', '')  -- telefone opcional: ausente/vazio vira NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_criar_cliente_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION criar_cliente_apos_signup();
```

### 1.2 `clientes_confirmacao_telefone` — REMOVIDA DO MVP

> **Removida do MVP pela decisão 10.4 (2026-07-29)** — sem confirmação de telefone por SMS: corta o custo e a integração com a Zenvia, e o telefone do Cliente passa a ser opcional e não verificado. Candidata a voltar em v2 se a verificação de número virar necessária.
>
> **Não criar esta tabela na migration inicial.** Nada mais no schema depende dela: a única FK era `cliente_id → clientes(id)` (partindo desta tabela, some junto), não há job `pg_cron` de limpeza de códigos expirados, e as RLS correspondentes foram removidas de `05-security.md` (§3.2). O DDL original fica abaixo por rastreabilidade.

<details>
<summary>DDL original (v2 — não aplicar no MVP)</summary>

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

</details>

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

> **Conta Asaas única no piloto (2026-08-12):** o piloto opera com **uma única
> conta Asaas da Keepit**, não uma subconta/chave por lojista. Consequências
> neste bloco: (a) `asaas_api_key_encrypted bytea` **saiu do DDL do piloto** —
> pertence ao modelo-alvo pós-piloto (chave por lojista, cripto `pgsodium`) e
> **não entra nas migrations do piloto**; (b) `asaas_wallet_id` permanece na
> tabela, **NULLABLE e sempre NULL no piloto** (reservado para o modelo-alvo).
> A chave Asaas vive apenas no env server-side da Edge Function
> `create-pix-payment`. Fonte: Story 3.8 (`SIMPLE` — aprovar lojista sem exigir
> criação automática de subconta Asaas) e o overlay
> [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md). O repasse ao lojista é
> **PIX manual** (ver overlay 07 §"Financeiro mínimo"). Reversão para o
> modelo-alvo: reintroduzir `asaas_api_key_encrypted` + `pgsodium` + a chamada
> `POST /v3/accounts` na aprovação.

> **Geo adiado — descoberta por lista no piloto (2026-08-12):** a descoberta do
> piloto é **por lista de hub + relação explícita loja↔hub** (tabela
> `estabelecimentos_hubs`, §2.3), **sem GPS, Haversine, mapa, geocoding ou
> ranking** — ver overlay [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md)
> §"Descoberta". Consequências neste bloco: (a) `lat` e `lng` viram **NULLABLE no
> piloto** (coordenadas precisas **não são exigidas no onboarding do lojista**),
> aliviando o cadastro; (b) `raio_atendimento_km` vira **NULLABLE no piloto** —
> sem matching geográfico, o raio de atendimento não é consultado; (c) o índice
> geo `idx_estab_geo` (matching por Haversine) **não é criado no piloto** — não há
> consulta geográfica. As três colunas e o índice **permanecem no modelo-alvo** e
> **não são apagados**: voltam a `NOT NULL`/criados quando geo/Haversine for
> reativado pelo gatilho "Número de hubs torna escolha manual ruim →
> GPS/Haversine/mapa" (overlay 07 §"Gatilhos para aumentar complexidade").

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
  lat numeric(9,6),                                  -- NULLABLE no piloto (descoberta por lista; ver nota "Geo adiado" §1.4). Modelo-alvo: NOT NULL quando geo/Haversine voltar
  lng numeric(9,6),                                  -- idem lat
  raio_atendimento_km numeric(4,1) CHECK (raio_atendimento_km IS NULL OR (raio_atendimento_km > 0 AND raio_atendimento_km <= 30)),  -- NULLABLE no piloto (sem matching geográfico); CHECK só se preenchido. Modelo-alvo: NOT NULL
  tempo_medio_entrega_min int NOT NULL CHECK (tempo_medio_entrega_min BETWEEN 5 AND 240),
  taxa_deslocamento_reais numeric(6,2) NOT NULL DEFAULT 0 CHECK (taxa_deslocamento_reais >= 0),
  ticket_minimo_reais numeric(10,2),                 -- NULL = usa global R$ 20

  -- Financeiro
  chave_pix text NOT NULL,
  chave_pix_tipo text NOT NULL CHECK (chave_pix_tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  asaas_wallet_id text,                              -- reservado; permanece NULL no piloto (conta única Keepit). Preenchido só no modelo-alvo (subconta por lojista)
  -- asaas_api_key_encrypted bytea,                  -- MODELO-ALVO PÓS-PILOTO (chave Asaas por lojista, cripto pgsodium). NÃO aplicado nas migrations do piloto — conta Asaas única, chave no env server-side. Ver nota §1.4 e Story 3.8 (SIMPLE)

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
CREATE INDEX idx_estab_cnpj ON estabelecimentos(cnpj);

-- idx_estab_geo: índice geo (lat, lng) para matching por Haversine — MODELO-ALVO PÓS-PILOTO.
-- NÃO criado no piloto (2026-08-12): a descoberta é por lista/relação explícita
-- (estabelecimentos_hubs, §2.3), sem consulta geográfica; lat/lng são NULLABLE no piloto.
-- Mantido por rastreabilidade — volta com o gatilho "Número de hubs torna escolha manual ruim
-- → GPS/Haversine/mapa" (overlay 07 §"Gatilhos"). Reversão: recriar o índice + tornar lat/lng NOT NULL.
-- CREATE INDEX idx_estab_geo ON estabelecimentos(lat, lng) WHERE status = 'ativo' AND pausado_manualmente = false;
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

> ⚠️ **Pendência 10.6 🟡** (`docs/PERGUNTAS_REGRAS_NEGOCIO.md`): provisionamento de contas admin e existência de papéis internos ainda **não foram decididos**. O DDL abaixo assume o default do Épico 3 — **lista plana, sem coluna de papel**, com inserção manual via SQL. Se a decisão trouxer papéis, é uma migration adicional + granularidade nas policies que hoje usam `is_admin()`.

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

### 2.3 `estabelecimentos_hubs` — relação loja↔hub (base da descoberta por lista)

Tabela de junção pura (chave composta, sem `id` próprio) que expressa **quais hubs
esta loja atende** / **quais lojas aparecem ao escolher um hub**. É a **base da
descoberta por lista** do piloto: o cliente escolhe um hub numa lista e vê as lojas
relacionadas — **sem GPS, Haversine, mapa, geocoding ou ranking especializado** (ver
overlay [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md) §"Descoberta").
Substitui, no piloto, o matching geográfico por coordenadas/raio (ver §1.4, nota
"Geo adiado"). Diferente das tabelas geo, **esta tabela É criada no piloto** — a
descoberta por hub é parte do recorte real (`CORE`/`SIMPLE`).

> **Associação por operação explícita (2026-08-12):** a relação é populada por uma
> **operação explícita** — na **aprovação do lojista** ou por gestão no painel Admin
> —, conforme o overlay 07 §"Descoberta" ("Relação loja↔hub explícita no banco ou
> definida na aprovação"). Este schema **modela a relação e garante integridade**; a
> **regra de negócio de COMO/QUANDO** a loja é vinculada ao hub (automática na
> aprovação? seleção manual do Admin? o lojista escolhe seus hubs?) **não está
> decidida** e **não é presumida aqui** — ver observação levantada para o Caio ao
> fim desta mudança.

```sql
CREATE TABLE estabelecimentos_hubs (
  estabelecimento_id uuid NOT NULL REFERENCES estabelecimentos(id) ON DELETE CASCADE,
  hub_id uuid NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (estabelecimento_id, hub_id)
);

-- Duas direções de consulta:
--   • "quais hubs esta loja atende"      → coberta pela PK (estabelecimento_id, hub_id).
--   • "quais lojas atendem este hub"      → índice dedicado (leitura central da descoberta por lista).
CREATE INDEX idx_estab_hubs_hub ON estabelecimentos_hubs(hub_id);
```

**Regra de integridade do pedido (validação server-side esperada):** um `pedido` só
pode referenciar um `hub_id` que a loja atende — deve existir a linha
`(pedidos.estabelecimento_id, pedidos.hub_id)` em `estabelecimentos_hubs` no momento
da criação do pedido. A invariante é **declarada aqui** e aplicada **server-side** na
criação do pedido — como CHECK via trigger `BEFORE INSERT` em `pedidos` **ou**
validação de existência dentro da RPC/Edge Function de criação de pedido. Não exige
DDL complexo: basta a verificação de existência antes de inserir; um par inexistente
rejeita o pedido.

> **Trade-off (FK composta vs. validação):** uma FK composta
> `pedidos(estabelecimento_id, hub_id) → estabelecimentos_hubs` seria possível (a PK
> cobre o par), mas acopla `pedidos` à junção e, com `ON DELETE RESTRICT`, **impediria
> desvincular uma loja de um hub enquanto houver pedidos históricos** naquele par —
> operacionalmente indesejável. Por isso preferimos a **validação server-side na
> criação** (não bloqueia manutenção da relação nem a evolução pós-piloto do modelo
> geo). Registrada como invariante, não como FK.

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
  -- Profundidade de implementação no piloto (2026-08-12): o CHECK mantém os 15
  -- valores de PROPÓSITO, como MODELO-ALVO. A permissividade é intencional — evita
  -- migration quando os estados adiados voltarem. No piloto, porém, IMPLEMENTA-SE
  -- apenas o subconjunto de transições do overlay `07-mvp-pilot-backend.md`
  -- §"Fluxo do pedido no piloto":
  --   aguardando_pagamento → aguardando_aceite → (aceito | em_preparo) → no_hub → entregue,
  --   + 'cancelado' (exceções pré-aceite) e o rótulo operacional de suporte do overlay.
  -- Os estados ligados a automações adiadas (LATER) permanecem no enum SEM lógica de
  -- transição no piloto: 'cancelado_timeout' (job pg_cron de timeout, §7 / Story 6.10),
  -- 'cancelado_atraso' (push de atraso ao lojista), 'estornado_chargeback' (webhook de
  -- chargeback) e os demais que dependam de job/push/chargeback ('cancelado_admin',
  -- 'saindo_hub', 'recusado', 'nao_retirado', 'nao_entregue_lojista'). Voltam junto com
  -- a automação correspondente, sem alterar este DDL.
  -- Cancelamentos no piloto usam 'cancelado' + a coluna de motivo JÁ EXISTENTE desta
  -- tabela; exceções pós-aceite seguem para operação humana (rótulo 'support_required'
  -- do overlay 07, sem valor de enum dedicado no piloto). Mapeamento das colunas de motivo:
  --   • recusa do lojista (pré-aceite)   → status='cancelado' + motivo_recusa
  --   • cancelamento comum               → status='cancelado' + motivo_cancelamento
  --   • cliente não retirou (pós-aceite) → exceção operacional + motivo_nao_retirado
  -- A transição para 'entregue' continua EXCLUSIVA da RPC de PIN (server-side; mudança 3).

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

-- No piloto (2026-08-12): serve à consulta manual do Admin de pedidos vencidos
-- (status='aguardando_aceite' AND criado_em < now() - interval '10 min'), já que o
-- job de timeout automático (§7.1 / Story 6.10) está fora do piloto. Índice barato,
-- mantido — passa a servir também o job de timeout quando ele for reativado.
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

> **Reconciliação schema↔overlay (2026-08-12):** o overlay
> [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md) §"Financeiro mínimo" já
> especifica **um ledger simples e auditável** (uma linha por lançamento: referência
> ao pedido, tipo `charge`/`platform_fee`/`merchant_credit`/`refund`/`payout`, valor
> imutável em centavos, status, id externo Asaas, timestamps e ator admin). Este
> schema, porém, modelava o financeiro de forma **fragmentada** — quatro tabelas
> (`reembolsos_pendentes`, `saques`, `debitos_lojista`, `chargebacks`) mais uma view
> de 5 CTEs que **recalculava** o saldo. Para o **piloto**, unificamos o financeiro
> em **um único ledger append-only** (`lancamentos_financeiros`, §6.1), tornando o
> saldo uma agregação `SUM`/`CASE` trivial (§6.2). As quatro tabelas antigas
> permanecem como **modelo-alvo pós-piloto** (§6.3), preservadas por rastreabilidade
> e **não aplicadas nas migrations do piloto**. Motivação: menos código para
> construir e manter (uma tabela + `SUM` vs. 3–4 tabelas + view de 5 CTEs), mantendo
> a regra inegociável do overlay — **valores são a fonte da verdade no banco, nunca
> soma recalculada só na UI**.

### 6.1 `lancamentos_financeiros` — ledger único do piloto

Ledger **append-only / imutável**: uma linha por movimento financeiro. É a **fonte
da verdade** do dinheiro no piloto. Correções **nunca** alteram o valor de uma
linha existente — entram como **novos lançamentos** (estorno + relançamento). Só
campos operacionais do passo manual do Admin (`status`, `asaas_id_externo`,
`concluido_em`, `ator_admin_id`, `detalhe`) podem sofrer `UPDATE`; `valor_centavos`,
`tipo` e os vínculos (`estabelecimento_id`, `pedido_id`) são imutáveis (trigger
abaixo).

**Convenção de sinal (perspectiva da carteira do lojista):** `valor_centavos` é
**assinado**. **Positivo = aumenta o que a Keepit deve ao lojista**; **negativo =
reduz**. Por tipo:

| Tipo | Sinal | Significado | Entra na carteira? |
|---|---|---|---|
| `charge` | + | pagamento do cliente pelo pedido (recibo da plataforma) | **Não** — auditoria/rastreio do dinheiro que entrou |
| `platform_fee` | − | comissão Keepit de **12%** sobre o subtotal do pedido | **Sim** (débito da comissão) |
| `merchant_credit` | + | crédito bruto do pedido entregue = `subtotal + taxa_deslocamento` | **Sim** (sujeito a D+7) |
| `merchant_credit` | − | ajuste manual do Admin que **debita** o lojista (`admin_acao_financeira`) | **Sim** (imediato → `total_debitado`) |
| `refund` | − | dinheiro devolvido ao **cliente** (reembolso) | **Não** — auditoria; espelha o legado, onde `reembolsos_pendentes` **não** entrava na carteira |
| `payout` | − | saque/repasse PIX manual ao lojista | **Sim** (imediato → `total_sacado`) |

> **Líquido por pedido entregue:** `merchant_credit` (+`subtotal+deslocamento`) somado
> a `platform_fee` (−`taxa_keepit`) reproduz exatamente o crédito líquido do modelo
> antigo (`subtotal − taxa_keepit + deslocamento`). A taxa de 12% e a janela D+7 **já
> existiam** no schema; aqui apenas passam a ser **representadas como lançamentos** —
> nenhum percentual novo foi inventado.

```sql
CREATE TABLE lancamentos_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculos (imutáveis)
  estabelecimento_id uuid NOT NULL REFERENCES estabelecimentos(id) ON DELETE RESTRICT,
  pedido_id uuid REFERENCES pedidos(id) ON DELETE RESTRICT,   -- NULL para ajuste manual sem pedido

  -- Fato financeiro (imutável)
  tipo text NOT NULL CHECK (tipo IN ('charge', 'platform_fee', 'merchant_credit', 'refund', 'payout')),
  valor_centavos bigint NOT NULL,                    -- assinado; imutável (ver convenção de sinal)

  -- Passo manual do Admin / execução Asaas (mutável)
  status text NOT NULL DEFAULT 'concluido'
    CHECK (status IN ('pendente', 'concluido', 'erro')),
  asaas_id_externo text,                             -- id de cobrança/transferência Asaas, quando existir
  ator_admin_id uuid REFERENCES auth.users(id),      -- admin que executou a ação manual (payout/refund/ajuste)
  detalhe text,

  -- Liberação D+7: preenchido só para o crédito de pedido entregue (= entregue_em + 7 dias).
  -- NULL = disponível imediatamente (charge, platform_fee acompanha o crédito, payout, refund, ajuste).
  disponivel_em timestamptz,

  criado_em timestamptz NOT NULL DEFAULT NOW(),
  concluido_em timestamptz                           -- quando o passo manual (payout/refund) é concluído
);

CREATE INDEX idx_lancamentos_estab ON lancamentos_financeiros(estabelecimento_id, disponivel_em);
CREATE INDEX idx_lancamentos_pendentes ON lancamentos_financeiros(status, criado_em)
  WHERE status = 'pendente';                         -- filas do Admin (payout/refund a executar)
CREATE INDEX idx_lancamentos_pedido ON lancamentos_financeiros(pedido_id)
  WHERE pedido_id IS NOT NULL;
```

**Imutabilidade do valor (append-only enforcado):**

```sql
CREATE OR REPLACE FUNCTION lancamento_financeiro_imutavel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.valor_centavos      IS DISTINCT FROM OLD.valor_centavos
     OR NEW.tipo             IS DISTINCT FROM OLD.tipo
     OR NEW.estabelecimento_id IS DISTINCT FROM OLD.estabelecimento_id
     OR NEW.pedido_id        IS DISTINCT FROM OLD.pedido_id
     OR NEW.criado_em        IS DISTINCT FROM OLD.criado_em THEN
    RAISE EXCEPTION 'lancamentos_financeiros: valor/tipo/vínculo são imutáveis — registre um NOVO lançamento para corrigir';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lancamento_imutavel
  BEFORE UPDATE ON lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION lancamento_financeiro_imutavel();
```

**Regra do saldo com janela D+7.** O crédito de um pedido entregue só entra no saldo
**DISPONÍVEL** após `entregue_em <= now() - interval '7 days'`; antes disso é saldo
**BLOQUEADO**. Essa é a mesma semântica que vivia na view `carteira_lojista` antiga.
No ledger, ela é materializada no campo `disponivel_em`:

- Para o `merchant_credit` **positivo** (crédito do pedido) e seu `platform_fee`
  pareado, `disponivel_em = entregue_em + interval '7 days'` (gravado no momento em
  que `confirmar_pin_pedido` marca `entregue_em` — ver overlay 07 §RPC). Assim
  `disponivel_em <= now()` ⟺ `entregue_em <= now() - interval '7 days'`.
- Para `payout`, `refund` e ajustes (`merchant_credit` negativo), `disponivel_em`
  fica **NULL** (efeito imediato — débito/saque não é "bloqueado").

Escrita financeira administrativa (reembolso/repasse/ajuste) passa **somente** pela
RPC `admin_acao_financeira(...)` `SECURITY DEFINER` sob `is_admin()` (overlay 07),
sempre com `ator_admin_id`. O webhook Asaas (`asaas-payment-webhook`) registra o
`charge` do pagamento confirmado.

### 6.2 View `carteira_lojista` — agregação do ledger

Substitui as 5 CTEs sobre múltiplas tabelas por uma agregação `SUM`/`FILTER` direta
sobre `lancamentos_financeiros`. **Preserva exatamente os mesmos campos de saída**
consumidos pela UI da carteira (`packages/core-data` `WalletPort` →
`saldo_disponivel_reais`, `saldo_bloqueado_reais`, `total_sacado_reais`,
`total_debitado_reais`). O ledger é em **centavos**; a view divide por 100 para
manter a interface em reais.

```sql
CREATE OR REPLACE VIEW carteira_lojista AS
SELECT
  e.id AS estabelecimento_id,

  -- Disponível: créditos líquidos liberados (D+7) + ajustes/débitos imediatos − saques.
  --   merchant_credit/platform_fee: entram quando disponivel_em já passou (NULL = imediato, ex.: ajuste negativo).
  --   payout (negativo): reduz o disponível; inclui 'pendente' para evitar overdraw, exclui 'erro'.
  COALESCE(SUM(l.valor_centavos) FILTER (
    WHERE (l.tipo IN ('merchant_credit', 'platform_fee')
            AND (l.disponivel_em IS NULL OR l.disponivel_em <= NOW()))
       OR (l.tipo = 'payout' AND l.status <> 'erro')
  ), 0) / 100.0 AS saldo_disponivel_reais,

  -- Bloqueado: crédito líquido (merchant_credit + platform_fee) ainda dentro da janela D+7.
  COALESCE(SUM(l.valor_centavos) FILTER (
    WHERE l.tipo IN ('merchant_credit', 'platform_fee')
      AND l.disponivel_em IS NOT NULL AND l.disponivel_em > NOW()
  ), 0) / 100.0 AS saldo_bloqueado_reais,

  -- Total sacado (payout é negativo no ledger; excluir 'erro').
  COALESCE(-SUM(l.valor_centavos) FILTER (
    WHERE l.tipo = 'payout' AND l.status <> 'erro'
  ), 0) / 100.0 AS total_sacado_reais,

  -- Total debitado: ajustes manuais que reduzem a carteira (merchant_credit negativo).
  -- Pós-piloto: também a taxa de chargeback, quando reintroduzida (ver §6.3).
  COALESCE(-SUM(l.valor_centavos) FILTER (
    WHERE l.tipo = 'merchant_credit' AND l.valor_centavos < 0
  ), 0) / 100.0 AS total_debitado_reais
FROM estabelecimentos e
LEFT JOIN lancamentos_financeiros l ON l.estabelecimento_id = e.id
WHERE e.status = 'ativo'
GROUP BY e.id;
```

**Nota:** o saldo pode ficar negativo (ex.: ajuste/estorno maior que o crédito) — é
esperado (lojista fica devedor). A validação de saque sob saldo insuficiente é feita
na criação do `payout` (RPC/Edge Function que lê esta view); o mínimo de saque é
`businessConfig.saqueMinimoReais` (nunca hard-coded na view — o antigo
`CHECK (valor_reais >= 200)` era decisão de negócio e não vive mais no schema).

### 6.3 Modelo-alvo pós-piloto — tabelas financeiras fragmentadas

> **Fora do piloto (2026-08-12):** as tabelas `reembolsos_pendentes`, `saques`,
> `debitos_lojista` e `chargebacks` **NÃO são criadas nas migrations do piloto**.
> No piloto, todo o fluxo de reembolso/saque/ajuste/estorno é representado como
> **lançamentos no ledger único** (`lancamentos_financeiros`, §6.1), com `status`
> para o passo manual do Admin. Estas tabelas permanecem como modelo-alvo — voltam
> quando o volume/automação justificar (gatilho "Repasses manuais consomem tempo ou
> geram erro | Saque automático/subconta" no overlay
> [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md) §"Gatilhos"). Não deletar —
> mantidas por rastreabilidade.

**Mapeamento piloto (ledger) ↔ modelo-alvo (tabelas):**

| Fluxo | Piloto — lançamento no ledger | Modelo-alvo (tabela antiga) |
|---|---|---|
| Solicitação de saque | `payout` `status='pendente'`, `valor_centavos` negativo | `saques` (`status='solicitado'`) |
| Admin executa o PIX manual | mesmo lançamento → `status='concluido'`, grava `asaas_id_externo` + `concluido_em` + `ator_admin_id` | `saques` (`status='concluido'`, `asaas_transfer_id`) |
| Reembolso ao cliente | `refund` `status='pendente'`→`'concluido'` (auditoria; não entra na carteira) | `reembolsos_pendentes` |
| Ajuste/estorno que debita o lojista | `merchant_credit` negativo (via `admin_acao_financeira`, com `ator_admin_id`) | `debitos_lojista` (`motivo='ajuste_admin'`) |
| Chargeback | `merchant_credit` negativo (clawback) + `refund` — **pós-piloto** (cartão/chargeback fora do piloto, ver nota do topo) | `chargebacks` + `debitos_lojista` (`motivo='taxa_chargeback'`) |
| Comissão Keepit (12%) | `platform_fee` negativo por pedido | (calculado na view antiga) |
| Pagamento do cliente | `charge` positivo (via webhook Asaas) | (implícito em `pedidos`) |

<details>
<summary>DDLs do modelo-alvo (pós-piloto — NÃO aplicar nas migrations do piloto)</summary>

**`reembolsos_pendentes`** — fila de reembolsos manuais (Rodada 6).

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

**`saques`** — solicitações de saque do lojista.

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

**`chargebacks`** — registro de chargebacks recebidos via webhook Asaas.

```sql
CREATE TABLE chargebacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
  valor_reais numeric(10,2) NOT NULL,
  asaas_event_id text UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT NOW()
);
```

**`debitos_lojista`** — débitos que afetam a carteira (taxa de chargeback, ajustes manuais).

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

**View `carteira_lojista` (modelo-alvo — 5 CTEs sobre múltiplas tabelas):** a versão
com `creditos` (pedidos entregues), `saldo_disponivel`/`saldo_bloqueado` (janela D+7),
`saques_feitos` e `debitos`. Substituída no piloto pela agregação de §6.2 sobre o
ledger. Reintroduzida junto com as tabelas acima quando o gatilho de automação
disparar.

</details>

---

## 7. Jobs `pg_cron`

> **Fora do piloto (2026-08-12):** **toda a §7 é modelo-alvo pós-piloto e NÃO é
> aplicada nas migrations do piloto.** Os dois jobs abaixo dependem de capacidades
> adiadas: (a) o timeout automático de aceite (§7.1) corresponde à Story 6.10,
> classificada como `LATER` no plano do piloto — ver
> [`../prd/07-plano-mvp-piloto.md`](../prd/07-plano-mvp-piloto.md) — onde **o Admin
> apenas sinaliza pedidos vencidos por consulta manual**, sem cancelamento
> automático; (b) o aviso de atraso ao lojista (§7.2) depende de **push nativo**,
> também adiado (Stories 6.13/2.11 sem push). Consequências no piloto: nenhuma
> chamada `cron.schedule` é criada, a extensão `pg_cron` não é habilitada
> (ver §"Extensões") e a etapa 14 da ordem de migration (§8) fica fora da rodada.
> O DDL permanece por rastreabilidade do modelo-alvo — **não deletar**. Reversão:
> reabilitar `pg_cron` e agendar os jobs quando os gatilhos do overlay
> [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md) §"Gatilhos para aumentar
> complexidade" dispararem ("Admin não consegue acompanhar vencimentos | Job de
> timeout" e "Operação perde pedidos por falta de aviso | Push nativo").

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

**Adicionar coluna (modelo-alvo pós-piloto):** `pedidos.atrasado_notificado boolean NOT NULL DEFAULT false`.

> **Fora do piloto (2026-08-12):** esta coluna existe **apenas** para servir a
> flag consumida pelo job §7.2 + push nativo. Como ambos estão adiados, a coluna
> **não entra nas migrations do piloto** — pertence ao modelo-alvo. Entra junto
> com o job (mesma migration incremental, ex. `add_atrasado_notificado.sql` na
> §8) quando o gatilho de push do overlay
> [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md) disparar.

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
5. `estabelecimentos` + horários + falhas
6. `hubs` + horários
7. `estabelecimentos_hubs` (junção loja↔hub — base da descoberta por lista; após `estabelecimentos` e `hubs`, pois referencia ambos — §2.3)
8. `produtos`
9. `carrinho` + itens
10. `pedidos` + itens
11. `lancamentos_financeiros` + trigger de imutabilidade (ledger único do piloto — §6.1)
12. View `carteira_lojista` (agregação SUM/CASE sobre o ledger — §6.2)
13. `clientes_cartoes`
14. Jobs pg_cron

*(A antiga etapa 5, `clientes_confirmacao_telefone`, saiu com a decisão 10.4 — ver §1.2.)*

> **Financeiro do piloto (2026-08-12):** a etapa 11 aplica **apenas** o ledger único
> `lancamentos_financeiros`. As tabelas fragmentadas `reembolsos_pendentes`, `saques`,
> `debitos_lojista` e `chargebacks` são **modelo-alvo pós-piloto** (§6.3) e **não
> entram** nesta ordem — voltam, junto com a view de 5 CTEs, quando o gatilho de
> automação do overlay [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md)
> §"Gatilhos" disparar. A etapa 14 (jobs `pg_cron`) também fica fora do piloto (§7).*
>
> **Descoberta por lista (2026-08-12):** a etapa 7 (`estabelecimentos_hubs`) **entra
> no piloto** — é a base da descoberta por hub. Já o índice geo `idx_estab_geo` (na
> etapa 5) **não é criado** e `lat`/`lng`/`raio_atendimento_km` ficam **NULLABLE** no
> piloto (§1.4, nota "Geo adiado"). Ambos voltam ao modelo geográfico pelo gatilho
> "Número de hubs torna escolha manual ruim → GPS/Haversine/mapa".*

Ver `docs/architecture/05-security.md` para as políticas RLS de cada tabela.
