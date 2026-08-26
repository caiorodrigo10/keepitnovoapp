# Security — RLS Policies e Gestão de Segredos

> **Política do piloto (2026-07-31):** a simplificação de backend não reduz este
> documento. RLS, ownership, segredos server-side, idempotência e autorização
> administrativa continuam obrigatórios para todas as tabelas implementadas.
> Ver [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md).

**Autor:** @architect (Aria)
**Data:** 2026-07-02
**Escopo:** Políticas de segurança do Keepit MVP — Row-Level Security (RLS) por tabela, gestão de segredos, criptografia de dados sensíveis, autenticação admin, prevenção OWASP.

Este documento é normativo. Toda tabela nasce com RLS ativada. Toda policy vive em migration versionada.

## 1. Modelo de autorização

O Keepit tem **três papéis** e nenhum deles vive em `auth.users` metadata (que é editável pelo usuário). Cada papel é derivado da presença em uma tabela:

| Papel | Identificação | Fonte de verdade |
|---|---|---|
| **Cliente** | `EXISTS (SELECT 1 FROM clientes WHERE id = auth.uid())` | tabela `clientes` |
| **Lojista** | `EXISTS (SELECT 1 FROM estabelecimentos WHERE dono_user_id = auth.uid())` | tabela `estabelecimentos` |
| **Admin** | `is_admin()` (função SECURITY DEFINER) | tabela `admin_users` |

**Um user pode ser cliente e ter estabelecimento** (papéis não são mutuamente exclusivos — na prática, no MVP, os apps são separados e o mesmo user não vai fazer ambos, mas o modelo não impede).

### Funções utilitárias

Vivem no schema `public`. Todas `SECURITY DEFINER` (rodam com privilégios do owner, driblando RLS internamente) e `STABLE` (resultado consistente na mesma query).

```sql
-- Já definida em 03-data-models.md; repetida aqui por conveniência
CREATE OR REPLACE FUNCTION is_admin(user_id uuid DEFAULT auth.uid())
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE id = user_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Retorna o id do estabelecimento do lojista atual (ou NULL se não é lojista)
CREATE OR REPLACE FUNCTION meu_estabelecimento_id()
RETURNS uuid AS $$
  SELECT id FROM estabelecimentos WHERE dono_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- True se o pedido pertence ao user (como cliente OU como lojista OU se é admin)
CREATE OR REPLACE FUNCTION pode_ver_pedido(pedido_row pedidos)
RETURNS boolean AS $$
  SELECT
    is_admin()
    OR pedido_row.cliente_id = auth.uid()
    OR pedido_row.estabelecimento_id = meu_estabelecimento_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

## 2. Habilitar RLS em toda tabela

Regra absoluta: **toda tabela cria com RLS ativada** logo após criar. Sem exceção.

```sql
ALTER TABLE {tabela} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {tabela} FORCE ROW LEVEL SECURITY;  -- força RLS até para o owner
```

`FORCE ROW LEVEL SECURITY` garante que nem o dono do banco escapa das políticas. Isso protege contra bugs em Edge Functions que rodam com `service_role_key` — mesmo o service role deve autorizar-se com base em regras (via SECURITY DEFINER functions explícitas).

## 3. Políticas RLS por tabela

Padrão: uma policy por operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). Nomes descritivos.

### 3.1 `clientes`

> **PILOTO aplicado (2026-08-13, Bloco 09 / Story 8.5) — `cliente_atualiza_proprio`
> corrigida:** o `WITH CHECK` original abaixo (subquery `bloqueado = (SELECT
> bloqueado FROM clientes WHERE id = auth.uid())`) é **inexequível no Postgres**
> ("infinite recursion detected in policy", PG15) — mesmo problema já resolvido em
> `estabelecimentos` (§3.4, trigger `estabelecimentos_bloqueia_imutaveis`). A
> migration `20260813070002_clientes_bloqueio_admin.sql` substitui essa abordagem
> por um `BEFORE UPDATE` trigger (`clientes_bloqueia_imutaveis`) que bloqueia
> mudança de `bloqueado`/`motivo_bloqueio`/`bloqueado_em` para qualquer `current_user
> IN ('authenticated', 'anon')` — inclusive o admin logado, que também é
> `authenticated`. (Des)bloqueio passa a ser **RPC-only**
> (`bloquear_cliente`/`desbloquear_cliente`, `SECURITY DEFINER`, ver abaixo), o
> mesmo padrão já usado por `estabelecimentos.status`. `cliente_atualiza_proprio`
> perde o `WITH CHECK` de `bloqueado` (a coluna já é imutável via trigger,
> independente da policy).

```sql
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes FORCE ROW LEVEL SECURITY;

-- Cliente vê apenas o próprio perfil
CREATE POLICY cliente_le_proprio ON clientes
  FOR SELECT
  USING (id = auth.uid() OR is_admin());

-- Cliente atualiza apenas o próprio perfil. bloqueado/motivo_bloqueio/bloqueado_em
-- são imutáveis para 'authenticated'/'anon' via trigger (ver nota acima) — não
-- precisam de WITH CHECK dedicado aqui (evita a recursão do desenho original).
CREATE POLICY cliente_atualiza_proprio ON clientes
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin vê e atualiza qualquer cliente (SELECT de todos habilita a listagem
-- administrativa da Story 8.5; a trigger acima ainda impede o admin de tocar os
-- campos de bloqueio fora das RPCs)
CREATE POLICY admin_gerencia_clientes ON clientes
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- INSERT via trigger em auth.users (SECURITY DEFINER); user direto não insere
CREATE POLICY sem_insert_direto_clientes ON clientes
  FOR INSERT
  WITH CHECK (false);

-- BEFORE UPDATE: bloqueia troca de bloqueado/motivo_bloqueio/bloqueado_em por
-- authenticated/anon (inclusive admin logado) — só RPC SECURITY DEFINER
-- (current_user = owner) passa. Aplicada por 20260813070002_clientes_bloqueio_admin.sql.
CREATE OR REPLACE FUNCTION clientes_bloqueia_imutaveis()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.bloqueado         IS DISTINCT FROM OLD.bloqueado
       OR NEW.motivo_bloqueio IS DISTINCT FROM OLD.motivo_bloqueio
       OR NEW.bloqueado_em    IS DISTINCT FROM OLD.bloqueado_em THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: bloqueado/motivo_bloqueio/bloqueado_em só mudam por RPC admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trg_clientes_imutaveis
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION clientes_bloqueia_imutaveis();
```

**RPCs `bloquear_cliente(p_cliente_id, p_motivo)` / `desbloquear_cliente(p_cliente_id)`**
(Bloco 09, Story 8.5) — `SECURITY DEFINER` + `search_path=''`, guard `is_admin()`
(`NAO_AUTORIZADO` se não-admin), `MOTIVO_OBRIGATORIO` exige texto não-vazio em
`bloquear_cliente`. `REVOKE ALL FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated`
(mesmo padrão de hardening das demais RPCs admin — ver §3.14).

### 3.2 `clientes_confirmacao_telefone` — REMOVIDA DO MVP

> **Removida do MVP pela decisão 10.4 (2026-07-29)** — sem confirmação de telefone por SMS, a tabela não existe (ver `03-data-models.md` §1.2). Estas policies **não devem entrar na migration inicial**; sem a tabela, o `ALTER TABLE` falharia e quebraria a migration. Texto original mantido por rastreabilidade, já que o SMS é candidato a v2.

<details>
<summary>Policies originais (v2 — não aplicar no MVP)</summary>

Escrita só via Edge Function `service_role`. Cliente só lê próprio histórico se precisar.

```sql
ALTER TABLE clientes_confirmacao_telefone ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_confirmacao_telefone FORCE ROW LEVEL SECURITY;

CREATE POLICY cliente_ve_proprias_confirmacoes ON clientes_confirmacao_telefone
  FOR SELECT
  USING (cliente_id = auth.uid());

-- INSERT/UPDATE só via service_role em Edge Function
CREATE POLICY sem_escrita_direta ON clientes_confirmacao_telefone
  FOR ALL
  WITH CHECK (false);
```

**Nota:** Edge Function usa `SUPABASE_SERVICE_ROLE_KEY` que ignora RLS por natureza — a policy só protege contra escrita via cliente/anon key.

</details>

### 3.3 `clientes_cartoes`

```sql
ALTER TABLE clientes_cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_cartoes FORCE ROW LEVEL SECURITY;

CREATE POLICY cliente_gerencia_proprios_cartoes ON clientes_cartoes
  FOR ALL
  USING (cliente_id = auth.uid())
  WITH CHECK (cliente_id = auth.uid());

CREATE POLICY admin_le_cartoes ON clientes_cartoes
  FOR SELECT
  USING (is_admin());
```

### 3.4 `estabelecimentos`

> **PILOTO aplicado (2026-08-12/13, Stories 3.5/3.7/8.6) — `lojista_atualiza_proprio`
> corrigida:** o `WITH CHECK` abaixo com subconsultas na PRÓPRIA tabela
> (`status = (SELECT status FROM estabelecimentos WHERE id = estabelecimentos.id)`,
> etc.) é **inexequível no Postgres** (recursão infinita de policy, PG15) e tinha um
> bug de shadowing (`id = id` sempre verdadeiro). A migration
> `20260812123046_criar_estabelecimentos.sql` substitui a imutabilidade de
> `status`/`cnpj`/`asaas_wallet_id`/`dono_user_id` por um `BEFORE UPDATE` trigger
> (`estabelecimentos_bloqueia_imutaveis`), mesmo padrão depois reaplicado em
> `clientes` (§3.1, Bloco 09). `lojista_atualiza_proprio` fica só ownership
> (`dono_user_id = auth.uid()`); a imutabilidade das colunas sensíveis é
> responsabilidade do trigger, não da policy. `publico_ve_ativos` NÃO tem
> `OR is_admin()` — desnecessário: `admin_gerencia_estab` (`FOR ALL`) já concede
> SELECT de tudo ao admin, OR'd com as demais policies (`20260812132331`).
> **Suspensão/reativação são RPC-only (Bloco 09, Story 8.6):** `suspender_lojista`/
> `reativar_lojista` (`SECURITY DEFINER`) mudam `status` rodando como owner — o
> trigger libera esse caminho (`current_user` = owner, não `authenticated`), mas
> continua bloqueando qualquer `UPDATE` direto de `status` pelo app (inclusive
> admin logado). Ver §3.14 para a lista completa de RPCs administrativas.

```sql
ALTER TABLE estabelecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estabelecimentos FORCE ROW LEVEL SECURITY;

-- SELECT público apenas para estabelecimentos ativos (para clientes descobrirem);
-- dono vê o próprio; admin vê tudo via admin_gerencia_estab (FOR ALL) abaixo.
CREATE POLICY publico_ve_ativos ON estabelecimentos
  FOR SELECT
  USING (
    (status = 'ativo' AND pausado_manualmente = false AND excluido_em IS NULL)
    OR dono_user_id = auth.uid()
  );

-- Lojista atualiza dados operacionais do seu estabelecimento (ownership only).
-- Imutabilidade de status/cnpj/asaas_wallet_id/dono_user_id fica no trigger
-- `estabelecimentos_bloqueia_imutaveis` (ver nota acima e bloco abaixo).
CREATE POLICY lojista_atualiza_proprio ON estabelecimentos
  FOR UPDATE
  USING (dono_user_id = auth.uid())
  WITH CHECK (dono_user_id = auth.uid());

-- Admin faz tudo (concede SELECT de todos os estabelecimentos, inclusive
-- em_analise — base da fila de aprovação da Story 3.7)
CREATE POLICY admin_gerencia_estab ON estabelecimentos
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- INSERT via app do lojista após signup (cria com status em_analise). Na prática o
-- cadastro real passa pela RPC criar_estabelecimento_completo (SECURITY DEFINER);
-- esta policy é defesa em profundidade para INSERT direto com a chave anon/authenticated.
CREATE POLICY lojista_cria_proprio ON estabelecimentos
  FOR INSERT
  WITH CHECK (
    dono_user_id = auth.uid()
    AND status = 'em_analise'
    AND asaas_wallet_id IS NULL
  );

-- BEFORE UPDATE: bloqueia troca de dono_user_id/cnpj/status/asaas_wallet_id por
-- authenticated/anon (inclusive admin logado) — só caminhos privilegiados (RPC
-- SECURITY DEFINER, roda como owner) passam. Aplicada por 20260812123046_criar_estabelecimentos.sql.
CREATE OR REPLACE FUNCTION estabelecimentos_bloqueia_imutaveis()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.dono_user_id IS DISTINCT FROM OLD.dono_user_id THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: dono_user_id nao pode ser alterado';
    END IF;
    IF NEW.cnpj IS DISTINCT FROM OLD.cnpj THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: cnpj nao pode ser alterado';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: status so pode ser alterado por admin';
    END IF;
    IF NEW.asaas_wallet_id IS DISTINCT FROM OLD.asaas_wallet_id THEN
      RAISE EXCEPTION 'COLUNA_IMUTAVEL: asaas_wallet_id nao pode ser alterado pelo lojista';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trg_estabelecimentos_imutaveis
  BEFORE UPDATE ON estabelecimentos
  FOR EACH ROW EXECUTE FUNCTION estabelecimentos_bloqueia_imutaveis();
```

**RPCs `suspender_lojista(p_estabelecimento_id, p_motivo)` / `reativar_lojista(p_estabelecimento_id)`**
(Bloco 09, Story 8.6) — `SECURITY DEFINER` + `search_path=''`, guard `is_admin()`,
`ESTADO_INVALIDO` se a transição não é `ativo→suspenso` (suspender) ou
`suspenso→ativo` (reativar). `REVOKE ALL FROM PUBLIC, anon` + `GRANT EXECUTE TO
authenticated`. Ver §3.14.

### 3.5 `estabelecimentos_horarios`

```sql
ALTER TABLE estabelecimentos_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE estabelecimentos_horarios FORCE ROW LEVEL SECURITY;

CREATE POLICY publico_ve_horarios ON estabelecimentos_horarios
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM estabelecimentos e
      WHERE e.id = estabelecimento_id
        AND (
          (e.status = 'ativo' AND e.excluido_em IS NULL)
          OR e.dono_user_id = auth.uid()
          OR is_admin()
        )
    )
  );

CREATE POLICY lojista_gerencia_horarios ON estabelecimentos_horarios
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM estabelecimentos WHERE id = estabelecimento_id AND dono_user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM estabelecimentos WHERE id = estabelecimento_id AND dono_user_id = auth.uid())
    OR is_admin()
  );
```

### 3.6 `estabelecimentos_falhas`

Só admin lê e escreve. Lojista não vê seu próprio histórico (por design — reduz atrito).

> **PILOTO aplicado (2026-08-13, Bloco 09 / Story 8.8):** tabela e policy abaixo
> aplicadas tal como documentadas por
> `20260813070005_criar_estabelecimentos_falhas.sql` — nenhuma divergência (o DDL
> era modelo-alvo desde a Story 1.10; o Bloco 09 apenas materializou o que já
> estava aqui). Admin-only confirmado; sem policy de leitura para o lojista.

```sql
ALTER TABLE estabelecimentos_falhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE estabelecimentos_falhas FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_gerencia_falhas ON estabelecimentos_falhas
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
```

### 3.7 `admin_users`

Só admin lê. Ninguém insere via API (só via SQL manual do owner do Supabase).

```sql
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_le_admins ON admin_users
  FOR SELECT
  USING (is_admin());

CREATE POLICY sem_insert_direto_admins ON admin_users
  FOR ALL
  WITH CHECK (false);
```

**Adição de admin novo**: via SQL rodado por owner do Supabase (documentado no runbook operacional).

### 3.8 `hubs` e `hubs_horarios`

```sql
ALTER TABLE hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubs FORCE ROW LEVEL SECURITY;

-- Público (autenticado) lê hubs ativos
CREATE POLICY publico_ve_hubs ON hubs
  FOR SELECT
  USING (ativo = true OR is_admin());

CREATE POLICY admin_gerencia_hubs ON hubs
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Mesma coisa para hubs_horarios
ALTER TABLE hubs_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubs_horarios FORCE ROW LEVEL SECURITY;

CREATE POLICY publico_ve_hubs_horarios ON hubs_horarios
  FOR SELECT USING (true);

CREATE POLICY admin_gerencia_hubs_horarios ON hubs_horarios
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
```

### 3.9 `produtos`

```sql
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos FORCE ROW LEVEL SECURITY;

-- Cliente vê ativos de estabelecimentos ativos
CREATE POLICY publico_ve_produtos_ativos ON produtos
  FOR SELECT
  USING (
    (ativo = true AND excluido_em IS NULL AND EXISTS (
      SELECT 1 FROM estabelecimentos e
      WHERE e.id = estabelecimento_id AND e.status = 'ativo'
    ))
    OR EXISTS (SELECT 1 FROM estabelecimentos WHERE id = estabelecimento_id AND dono_user_id = auth.uid())
    OR is_admin()
  );

-- Lojista gerencia próprios produtos
CREATE POLICY lojista_gerencia_produtos ON produtos
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM estabelecimentos WHERE id = estabelecimento_id AND dono_user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM estabelecimentos WHERE id = estabelecimento_id AND dono_user_id = auth.uid())
    OR is_admin()
  );
```

### 3.10 `carrinho` e `carrinho_itens`

```sql
ALTER TABLE carrinho ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrinho FORCE ROW LEVEL SECURITY;

CREATE POLICY cliente_gerencia_proprio_carrinho ON carrinho
  FOR ALL
  USING (cliente_id = auth.uid())
  WITH CHECK (cliente_id = auth.uid());

ALTER TABLE carrinho_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrinho_itens FORCE ROW LEVEL SECURITY;

CREATE POLICY cliente_gerencia_carrinho_itens ON carrinho_itens
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM carrinho WHERE id = carrinho_id AND cliente_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM carrinho WHERE id = carrinho_id AND cliente_id = auth.uid())
  );
```

### 3.11 `pedidos` e `pedidos_itens`

Tabela mais crítica — cliente E lojista veem o mesmo pedido.

```sql
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos FORCE ROW LEVEL SECURITY;

-- Cliente vê seus pedidos; lojista vê pedidos do seu estabelecimento; admin vê tudo
CREATE POLICY ve_pedidos_relacionados ON pedidos
  FOR SELECT
  USING (pode_ver_pedido(pedidos.*));

-- Cliente cria pedido apenas para si
CREATE POLICY cliente_cria_pedido ON pedidos
  FOR INSERT
  WITH CHECK (
    cliente_id = auth.uid()
    AND status = 'aguardando_pagamento'
  );

-- UPDATE tem restrição por campo — o mais seguro é canalizar via Edge Function.
-- Aqui abrimos UPDATE amplo para os relacionados e delegamos regra de campo para Edge Function.
-- (Cliente não deve poder mudar status, valores, pin. Isso vive em Edge Function via service_role.)
CREATE POLICY relacionados_atualizam_pedido ON pedidos
  FOR UPDATE
  USING (pode_ver_pedido(pedidos.*))
  WITH CHECK (pode_ver_pedido(pedidos.*));

-- Ninguém deleta pedidos direto (histórico obrigatório)
CREATE POLICY sem_delete_pedidos ON pedidos
  FOR DELETE
  USING (false);

ALTER TABLE pedidos_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_itens FORCE ROW LEVEL SECURITY;

CREATE POLICY ve_itens_relacionados ON pedidos_itens
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM pedidos WHERE id = pedido_id AND pode_ver_pedido(pedidos.*)));

CREATE POLICY sem_delete_pedidos_itens ON pedidos_itens
  FOR DELETE USING (false);
```

**Convenção crítica**: escrita em `pedidos.status`, `pin_hash`, valores, timestamps é **exclusiva de funções server-side** que validam pré-condições. Cliente e lojista **não fazem UPDATE direto** — chamam funções específicas (`aceitar-pedido`, confirmação de PIN, `cancelar-pedido`, etc.) que validam autorização e escrevem sob privilégio controlado.

> **PIN e ação financeira são RPC `SECURITY DEFINER` no piloto (2026-08-12):** a
> confirmação de PIN (`confirmar_pin_pedido`) e as ações financeiras
> administrativas **não** são Edge Functions — são RPCs PostgreSQL `SECURITY
> DEFINER` chamadas via `supabase-js`. O critério do piloto é: **Edge Function só
> quando há segredo server-side ou validação de origem externa (Asaas);
> autorização + escrita no banco resolvem-se com RLS + RPC `SECURITY DEFINER`**.
> Restam apenas `create-pix-payment` e `asaas-payment-webhook` como Edge
> Functions. As garantias de segurança são idênticas (validação server-side, PIN
> não exposto, autorização por papel/ownership); muda só o veículo. Ver
> [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md) §"Edge Functions
> mínimas".
>
> **Atualização (2026-08-13, Bloco 09):** `admin_acao_financeira` (nome
> genérico planejado neste parágrafo) foi **substituída na implementação real**
> por duas RPCs mais específicas — `confirmar_lancamento_admin` (confirma um
> `refund`/`payout` já `pendente` no ledger, Stories 8.2/8.9) e
> `forcar_cancelamento_pedido` (cancela um pedido em qualquer estado não-terminal
> e cria o `refund` `pendente` correspondente, Story 8.4). Nenhuma RPC "genérica"
> de ajuste financeiro ad-hoc foi aplicada no piloto. `forcar_cancelamento_pedido`
> é `SECURITY DEFINER` + guard `is_admin()`, `MOTIVO_OBRIGATORIO`/`ESTADO_INVALIDO`
> nomeados — grava `motivo_cancelamento` em `pedidos` e insere o lançamento
> `refund` em `lancamentos_financeiros` na mesma transação. Ver §3.14 para a
> lista completa de RPCs administrativas do Bloco 09.

### 3.12 `lancamentos_financeiros` — ledger único do piloto

> **PILOTO aplicado (2026-08-13, Bloco 08, Stories 7.6-7.8) — substitui o modelo
> fragmentado abaixo:** `reembolsos_pendentes`, `saques`, `chargebacks` e
> `debitos_lojista` **NÃO são criadas nas migrations do piloto** (ver
> `03-data-models.md` §6.3). Todo o financeiro sensível — reembolso, saque,
> ajuste, cobrança — vive numa única tabela append-only,
> `lancamentos_financeiros`, com leitura escopada por dono/admin e **escrita
> negada para todos os roles do app**: só as RPCs `SECURITY DEFINER` (rodam como
> owner, que tem `BYPASSRLS`) escrevem. As 4 policies antigas (DDL original
> preservado no `<details>` abaixo, por rastreabilidade) são substituídas pelas
> 4 policies do ledger.

```sql
ALTER TABLE lancamentos_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos_financeiros FORCE ROW LEVEL SECURITY;

-- SELECT: admin lê tudo; lojista só os lançamentos do próprio estabelecimento.
-- meu_estabelecimento_id() é NULL para quem não é lojista → "= NULL" nunca casa
-- (0 linhas), sem precisar de OR explícito para excluir clientes/anon.
CREATE POLICY le_ve_relacionados ON lancamentos_financeiros
  FOR SELECT
  USING (
    is_admin()
    OR estabelecimento_id = meu_estabelecimento_id()
  );

-- INSERT/UPDATE/DELETE diretos do app: NEGADOS para todo mundo, inclusive admin.
-- Só as RPCs SECURITY DEFINER escrevem (rodam como owner do banco, que tem BYPASSRLS):
--   criar_pedido (charge), avancar_estado_pedido (merchant_credit/platform_fee no
--   entregue), solicitar_saque (payout pendente), confirmar_lancamento_admin
--   (confirma refund/payout pendente), forcar_cancelamento_pedido (refund).
CREATE POLICY le_sem_insert_direto ON lancamentos_financeiros
  FOR INSERT WITH CHECK (false);
CREATE POLICY le_sem_update_direto ON lancamentos_financeiros
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY le_sem_delete_direto ON lancamentos_financeiros
  FOR DELETE USING (false);
```

**WARN 0028/0029 aceito (intencional, mesmo padrão dos Blocos 01-08):** os
advisors do Supabase (`anon_security_definer_function_executable` /
`authenticated_security_definer_function_executable`) disparam `WARN` genérico
para qualquer função `SECURITY DEFINER` executável por `anon`/`authenticated` —
mesmo quando a função já faz `REVOKE ALL FROM PUBLIC, anon` e só
`GRANT EXECUTE TO authenticated` (padrão de todas as RPCs administrativas do
Bloco 09, ver §3.14). O advisor não distingue "guardada por `is_admin()` dentro
da função" de "sem guard nenhum" — os dois WARN são **aceitos como ruído
esperado**, não um gap de segurança real (confirmado nas Stories 8.2/8.9).

<details>
<summary>DDLs do modelo-alvo (pós-piloto — NÃO aplicadas nas migrations do piloto)</summary>

```sql
-- reembolsos_pendentes
ALTER TABLE reembolsos_pendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reembolsos_pendentes FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_gerencia_reembolsos ON reembolsos_pendentes
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Cliente e lojista podem ler o status de reembolso do próprio pedido (opcional; MVP pode não expor)
-- Nada de UPDATE / DELETE para não-admins.

-- saques
ALTER TABLE saques ENABLE ROW LEVEL SECURITY;
ALTER TABLE saques FORCE ROW LEVEL SECURITY;

CREATE POLICY lojista_ve_proprios_saques ON saques
  FOR SELECT
  USING (
    estabelecimento_id = meu_estabelecimento_id()
    OR is_admin()
  );

-- Lojista solicita saque (INSERT via Edge Function que valida saldo)
-- Cliente direto NÃO insere; policy WITH CHECK false força uso da Edge Function
CREATE POLICY sem_insert_direto_saques ON saques
  FOR INSERT WITH CHECK (false);

CREATE POLICY admin_atualiza_saques ON saques
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- chargebacks — só admin lê, service_role escreve via webhook
ALTER TABLE chargebacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chargebacks FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_le_chargebacks ON chargebacks FOR SELECT USING (is_admin());

-- debitos_lojista — lojista vê os próprios, admin vê tudo
ALTER TABLE debitos_lojista ENABLE ROW LEVEL SECURITY;
ALTER TABLE debitos_lojista FORCE ROW LEVEL SECURITY;

CREATE POLICY lojista_ve_proprios_debitos ON debitos_lojista
  FOR SELECT USING (estabelecimento_id = meu_estabelecimento_id() OR is_admin());
```

</details>

### 3.13 View `carteira_lojista`

Views não têm RLS diretamente — mas herdam RLS das tabelas subjacentes se `security_invoker = true` (Postgres 15+).

```sql
ALTER VIEW carteira_lojista SET (security_invoker = true);
```

> **PILOTO aplicado (2026-08-13, Bloco 08, Story 7.6):** a view agrega
> `lancamentos_financeiros` `LEFT JOIN` `estabelecimentos` (ver `03-data-models.md`
> §6.2) — não mais `pedidos`/`saques`/`debitos_lojista` (essas três não existem no
> piloto). `security_invoker = true` faz a view respeitar a RLS de
> `lancamentos_financeiros` (§3.12, `le_ve_relacionados`) para quem consulta. Como
> o lojista só lê os próprios lançamentos, ele só vê o próprio saldo agregado;
> admin vê tudo. Mesma garantia do parágrafo original, ângulo do ledger único.

### 3.14 RPCs administrativas `SECURITY DEFINER` — visão consolidada (Bloco 09, Épico 8)

> **PILOTO aplicado (2026-08-13).** Toda operação administrativa sensível
> (reembolso/repasse, cancelamento forçado, bloqueio de cliente, suspensão de
> lojista) passa por RPC `SECURITY DEFINER`, nunca por `UPDATE` direto de
> cliente/lojista/admin sob RLS. Padrão de hardening comum a todas: `search_path
> = ''`, guard `is_admin()` no corpo (`RAISE EXCEPTION 'NAO_AUTORIZADO'` se
> falhar), `REVOKE ALL FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated`, e
> um vocabulário fixo de erros nomeados (`AUTENTICACAO_NECESSARIA`,
> `NAO_AUTORIZADO`, mais os específicos de cada RPC) que o adapter TS traduz em
> classes dedicadas — nunca um `catch` genérico.

| RPC | Story | Tabela afetada | Guard / erros nomeados | Doc de policy |
|---|---|---|---|---|
| `confirmar_lancamento_admin(p_lancamento_id, p_resultado, p_detalhe?, p_asaas_id_externo?)` | 8.2 / 8.9 | `lancamentos_financeiros` (`refund`/`payout` `pendente→concluido\|erro`) | `is_admin()`; `RESULTADO_INVALIDO`, `LANCAMENTO_NAO_ENCONTRADO`, `TIPO_INVALIDO`, `ESTADO_INVALIDO` | §3.12 |
| `forcar_cancelamento_pedido(p_pedido_id, p_motivo)` | 8.4 | `pedidos.status→cancelado` + INSERT `refund` em `lancamentos_financeiros` | `is_admin()`; `MOTIVO_OBRIGATORIO`, `PEDIDO_NAO_ENCONTRADO`, `ESTADO_INVALIDO` | §3.11 |
| `bloquear_cliente(p_cliente_id, p_motivo)` / `desbloquear_cliente(p_cliente_id)` | 8.5 | `clientes.bloqueado/motivo_bloqueio/bloqueado_em` | `is_admin()`; `MOTIVO_OBRIGATORIO` (só bloquear), `CLIENTE_NAO_ENCONTRADO` | §3.1 |
| `suspender_lojista(p_estabelecimento_id, p_motivo)` / `reativar_lojista(p_estabelecimento_id)` | 8.6 | `estabelecimentos.status` (`ativo↔suspenso`) | `is_admin()`; `MOTIVO_OBRIGATORIO` (só suspender), `ESTABELECIMENTO_NAO_ENCONTRADO`, `ESTADO_INVALIDO` | §3.4 |

Todas compartilham o mesmo **WARN 0028/0029 aceito** documentado em §3.12 — os
advisors do Supabase marcam qualquer `SECURITY DEFINER` executável por
`authenticated` como `WARN`, independente do guard `is_admin()` no corpo da
função; tratado como ruído esperado desde o Bloco 01.

## 4. Gestão de segredos

### 4.1 Variáveis por ambiente

| Segredo | Onde vive | Quem acessa |
|---|---|---|
| `SUPABASE_URL` | `.env` no cliente + no admin + Edge Functions | Todos |
| `SUPABASE_ANON_KEY` | `.env` no cliente + no admin + Edge Functions | Todos |
| `SUPABASE_SERVICE_ROLE_KEY` | **Apenas Edge Functions** (env do Supabase) | Nunca no app mobile |
| `ASAAS_API_KEY` | Env das Edge Functions | Só backend |
| `ASAAS_WEBHOOK_TOKEN` | Env das Edge Functions | Só backend (valida header do webhook) |
| `EXPO_ACCESS_TOKEN` | GitHub Actions Secret | Só CI para builds |

*(`ZENVIA_API_TOKEN` **saiu pela decisão 10.4 (2026-07-29)** — sem SMS no MVP, não há integração com a Zenvia e nenhum ambiente precisa dessa variável. Volta junto com o SMS se ele entrar em v2.)*

**Regra absoluta**: nada de `SUPABASE_SERVICE_ROLE_KEY` ou `ASAAS_API_KEY` no bundle dos apps mobile. Se aparecer em `apps/cliente/` ou `apps/lojista/`, é vulnerabilidade crítica.

### 4.2 Rotação

- Chave Asaas (`ASAAS_API_KEY`): rotacionar a cada 6 meses ou imediatamente após qualquer suspeita de vazamento.
- `SUPABASE_SERVICE_ROLE_KEY`: rotacionar via Supabase Dashboard; atualizar env das Edge Functions e do CI.
- `ASAAS_WEBHOOK_TOKEN`: rotacionar sempre que reconfigurar webhook no Asaas.

### 4.3 Criptografia at-rest da chave PIX e chave Asaas do lojista

> **Modelo-alvo pós-piloto — não aplicado no piloto (2026-08-12):** o bloco abaixo
> (`asaas_api_key_encrypted` + fluxo `pgsodium.crypto_aead_det_encrypt`/`_decrypt`
> de subconta por lojista) descreve o **modelo-alvo pós-piloto**, não o que roda no
> piloto. No piloto há **uma única conta Asaas da Keepit**, cuja chave vive apenas
> no **env server-side da Edge Function** (`ASAAS_API_KEY`), **nunca no banco** —
> logo **não há** `asaas_api_key_encrypted` persistido, nem subconta/chave por
> lojista, e a extensão `pgsodium` fica fora do piloto (ver
> [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md) §"Chave Asaas única no
> piloto" e `03-data-models.md` §1.4/§"Extensões"). O texto é **preservado por
> rastreabilidade**: a cripto por-loja volta apenas com o gatilho "repasses manuais
> consomem tempo ou geram erro" (subconta/saque automático).

`estabelecimentos.asaas_api_key_encrypted` guarda a API key da subconta do lojista — usada para operações específicas do lojista via Asaas (raro no MVP porque a Keepit master já basta). Sempre criptografada via `pgsodium`.

```sql
-- Setup (uma vez)
SELECT pgsodium.create_key(name := 'asaas_subaccount_key');

-- Criptografar antes de armazenar (via Edge Function ou SQL):
INSERT INTO estabelecimentos (id, ..., asaas_api_key_encrypted)
VALUES (
  ...,
  pgsodium.crypto_aead_det_encrypt(
    convert_to($1, 'utf8'),           -- $1 = api key em texto
    convert_to(estab_id::text, 'utf8'),
    (SELECT id FROM pgsodium.key WHERE name = 'asaas_subaccount_key')
  )
);

-- Descriptografar quando precisar usar:
SELECT convert_from(
  pgsodium.crypto_aead_det_decrypt(
    asaas_api_key_encrypted,
    convert_to(id::text, 'utf8'),
    (SELECT id FROM pgsodium.key WHERE name = 'asaas_subaccount_key')
  ),
  'utf8'
) FROM estabelecimentos WHERE id = $estab_id;
```

**Chave PIX do lojista** (`estabelecimentos.chave_pix`): não criptografada em nível de banco no MVP — é dado semi-público (aparece no comprovante de saque). Se stakeholder pedir criptografia depois, aplica-se mesmo padrão do `pgsodium`.

### 4.4 PIN do pedido

- `pedidos.pin_hash` = `crypt(pin_texto, gen_salt('bf', 10))` (bcrypt round 10).
- `pedidos.pin_texto` = texto plano — **apenas** para exibir na tela do cliente. Nunca é logado. Nunca sai do banco para o app do lojista. Pode ser lido pelo cliente-dono do pedido via RLS.
- Verificação no lojista digitando: a confirmação recebe `pin_digitado`, faz `SELECT pin_hash FROM pedidos WHERE id = $1` e compara com `crypt(pin_digitado, pin_hash) = pin_hash`.

> **Confirmação de PIN é RPC `SECURITY DEFINER` no piloto (2026-08-12):** a
> verificação **não** é mais uma Edge Function. Passou a ser a RPC PostgreSQL
> `confirmar_pin_pedido(pedido_id, pin)` (`SECURITY DEFINER`), chamada via
> `supabase-js` — ver [`07-mvp-pilot-backend.md`](./07-mvp-pilot-backend.md)
> §"Operações server-side via RPC". Todos os requisitos de segurança permanecem:
> validação server-side (`pgcrypto crypt()`), PIN nunca exposto em texto puro do
> lado da verificação, autorização por papel/ownership (lojista dono do pedido) e
> estado válido, incremento de `tentativas_pin`/`pin_bloqueado_ate`, e **somente
> esta função pode transicionar o pedido para entregue**. Mudou o veículo (Edge
> Function → RPC), não a regra.

**Alternativa considerada e descartada**: guardar só o hash (sem `pin_texto`). Descartada porque o cliente precisa ver o código na tela — não há como derivar do hash. Compromisso aceito: `pin_texto` protegido por RLS (cliente vê o próprio; ninguém mais).

## 5. Autenticação admin

- Admin usa **mesmo Supabase Auth** que cliente e lojista (e-mail + senha) — confirmado pela **decisão 10.4 (2026-07-29)**: os três perfis usam e-mail + senha, sem SMS, sem SSO.
- Diferença: existência em `admin_users` (adicionada manualmente via SQL do owner).
- ⚠️ **Pendências que tocam esta seção e ainda não estão decididas** (`docs/PERGUNTAS_REGRAS_NEGOCIO.md`):
  - **10.5 🟡** — se a confirmação de e-mail é obrigatória. A opção `Confirm email` do Supabase Auth é **configuração por projeto**, portanto vale igualmente para cliente, lojista e admin. Até a decisão sair, assume-se `off` (mesmo default do Épico 2/3). Não implementar nada específico de confirmação antes da resposta.
  - **10.6 🟡** — provisionamento de contas admin e existência de papéis. Até a decisão sair, `admin_users` é **lista plana sem coluna de papel** e a inserção é manual via SQL — que é o que este documento e `03-data-models.md` §1.7 descrevem. Se a resposta trouxer papéis, muda a tabela e as policies que hoje usam `is_admin()` sem granularidade.
- **Sem 2FA no MVP** — decisão consciente para reduzir escopo. Adicionar quando houver mais de 2 admins.
- Admin **não usa os apps mobile** — só o admin web. RLS impede que um admin faça login no app do cliente e veja algo estranho (o app cliente só usa policies orientadas a cliente).

## 6. Prevenção OWASP básicos

### 6.1 SQL Injection

- Todo query passa por `supabase-js` (parametrizado) ou `sql`tagged template em Edge Functions.
- Nunca concatenar string SQL com input do usuário.

### 6.2 XSS (admin web)

- Next.js escapa por padrão em `{variable}` JSX.
- `dangerouslySetInnerHTML` **proibido** no admin — se precisar renderizar Markdown (Termos/Política), usar biblioteca `react-markdown` com sanitização default.

### 6.3 CSRF

- API Supabase usa JWT no header, não cookie — imune a CSRF clássico.
- Webhook do Asaas usa token no header (`ASAAS_WEBHOOK_TOKEN`) validado pela Edge Function antes de processar.

### 6.4 IDOR (Insecure Direct Object Reference)

- Bloqueado por RLS. Um cliente que tenta ler `GET /pedidos/{outro_id}` recebe zero linhas — não vê nem mesmo o `404 vs 403`.

### 6.5 Rate limiting

- *(O rate limit de SMS — "max 3 códigos por telefone por hora" — **saiu pela decisão 10.4 (2026-07-29)**, junto com a integração Zenvia. Volta com o SMS em v2, se houver.)*
- **Login**: Supabase Auth já tem proteção nativa contra brute-force (delay progressivo). É a única barreira de força bruta relevante do MVP, já que os três perfis (cliente, lojista, admin) autenticam por e-mail + senha.
- **API pública**: Supabase gerencia rate limit por IP no seu edge. MVP não precisa camada adicional.

### 6.6 Log de dados sensíveis

- **Proibido logar**: PIN em texto plano, chave PIX, dados de cartão (Asaas cuida), API keys, senhas.
- **OK logar** (com hash / máscara se necessário): CPF (mascarado `123.***.***-45`), telefone parcial, e-mail.
- Edge Functions usam `console.log` estruturado (JSON); Supabase agrega em Logs Explorer.

### 6.7 Storage (fotos)

- **Buckets privados** por padrão. URLs assinadas com expiração curta (5-60 min) geradas pelo backend.
- Bucket público único: `hubs` (fotos institucionais aparecem para todo cliente).
- Uploads validam MIME type e tamanho (max 5MB) no cliente antes de enviar; Edge Function pode revalidar.

## 7. Auditoria

Log mínimo de eventos sensíveis em tabela dedicada:

```sql
CREATE TABLE auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id),
  acao text NOT NULL,                                -- 'aprovou_lojista', 'suspendeu_lojista', 'estornou_pedido', etc.
  alvo_tipo text NOT NULL,                           -- 'estabelecimento', 'pedido', 'cliente'
  alvo_id uuid NOT NULL,
  detalhes jsonb,
  criado_em timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auditoria_actor ON auditoria(actor_user_id, criado_em DESC);
CREATE INDEX idx_auditoria_alvo ON auditoria(alvo_tipo, alvo_id, criado_em DESC);

ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria FORCE ROW LEVEL SECURITY;
CREATE POLICY admin_le_auditoria ON auditoria FOR SELECT USING (is_admin());
```

Edge Functions administrativas (aprovar/rejeitar/suspender/estornar) inserem em `auditoria` como primeira ação antes de qualquer efeito colateral.

## 8. Testes de segurança obrigatórios antes do go-live

- [ ] Tentar `SELECT * FROM pedidos` como cliente A e confirmar que só vê os dele.
- [ ] Tentar `UPDATE pedidos SET status = 'entregue'` como cliente e confirmar que falha (RLS + convenção Edge Function).
- [ ] Tentar `SELECT * FROM clientes` como lojista e confirmar que só vê os que fizeram pedido nele (na verdade, lojista não deve poder ler `clientes` — se precisar do nome, sai via join no `pedidos`).
- [ ] Tentar `SELECT service_role_key` de dentro do bundle mobile — não deve existir.
- [ ] Testar webhook Asaas com token errado — deve retornar 401.
- [ ] Tentar `INSERT`/`UPDATE` em `clientes` com `id` de outro usuário — deve falhar (RLS).
- [ ] Confirmar botão "excluir minha conta" abre WhatsApp com mensagem correta em iOS e Android.

## 9. O que fica para depois (v2+)

- 2FA para admin.
- **Verificação de telefone por SMS** (tabela `clientes_confirmacao_telefone`, integração Zenvia, `ZENVIA_API_TOKEN`, rate limit de códigos) — removida do MVP pela decisão 10.4 (2026-07-29); volta aqui se a verificação de número virar necessária.
- Rate limiting customizado (Cloudflare ou similar) se abusos aparecerem.
- Encryption-at-rest total do banco (Supabase já faz por padrão via disk encryption; explicitamente comunicado nas Políticas).
- Certificate pinning nos apps mobile.
- Bug bounty / pentest formal.
