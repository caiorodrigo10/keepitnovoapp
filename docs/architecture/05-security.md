# Security — RLS Policies e Gestão de Segredos

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

```sql
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes FORCE ROW LEVEL SECURITY;

-- Cliente vê apenas o próprio perfil
CREATE POLICY cliente_le_proprio ON clientes
  FOR SELECT
  USING (id = auth.uid() OR is_admin());

-- Cliente atualiza apenas o próprio perfil (não pode mudar bloqueado, cpf via UPDATE direto)
CREATE POLICY cliente_atualiza_proprio ON clientes
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND bloqueado = (SELECT bloqueado FROM clientes WHERE id = auth.uid())  -- não pode auto-desbloquear
  );

-- Admin vê e atualiza qualquer cliente
CREATE POLICY admin_gerencia_clientes ON clientes
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- INSERT via trigger em auth.users (SECURITY DEFINER); user direto não insere
CREATE POLICY sem_insert_direto_clientes ON clientes
  FOR INSERT
  WITH CHECK (false);
```

### 3.2 `clientes_confirmacao_telefone`

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

```sql
ALTER TABLE estabelecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estabelecimentos FORCE ROW LEVEL SECURITY;

-- SELECT público apenas para estabelecimentos ativos (para clientes descobrirem)
CREATE POLICY publico_ve_ativos ON estabelecimentos
  FOR SELECT
  USING (
    (status = 'ativo' AND pausado_manualmente = false AND excluido_em IS NULL)
    OR dono_user_id = auth.uid()
    OR is_admin()
  );

-- Lojista atualiza dados operacionais do seu estabelecimento
-- Restrição: não pode mudar status, CNPJ, dono_user_id, asaas_wallet_id, aprovado_em
CREATE POLICY lojista_atualiza_proprio ON estabelecimentos
  FOR UPDATE
  USING (dono_user_id = auth.uid())
  WITH CHECK (
    dono_user_id = auth.uid()
    AND status = (SELECT status FROM estabelecimentos WHERE id = estabelecimentos.id)
    AND cnpj = (SELECT cnpj FROM estabelecimentos WHERE id = estabelecimentos.id)
    AND asaas_wallet_id IS NOT DISTINCT FROM (SELECT asaas_wallet_id FROM estabelecimentos WHERE id = estabelecimentos.id)
  );

-- Admin faz tudo
CREATE POLICY admin_gerencia_estab ON estabelecimentos
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- INSERT via app do lojista após signup (cria com status em_analise)
CREATE POLICY lojista_cria_proprio ON estabelecimentos
  FOR INSERT
  WITH CHECK (
    dono_user_id = auth.uid()
    AND status = 'em_analise'
    AND asaas_wallet_id IS NULL
  );
```

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

**Convenção crítica**: escrita em `pedidos.status`, `pin_hash`, valores, timestamps é **exclusiva de Edge Functions** rodando com `service_role`. Cliente e lojista **não fazem UPDATE direto** — chamam Edge Functions específicas (`aceitar-pedido`, `confirmar-pin`, `cancelar-pedido`, etc.) que validam pré-condições e escrevem via service role.

### 3.12 `reembolsos_pendentes`, `saques`, `chargebacks`, `debitos_lojista`

Financeiro sensível — leitura escopada, escrita só admin/service_role.

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

### 3.13 View `carteira_lojista`

Views não têm RLS diretamente — mas herdam RLS das tabelas subjacentes se `security_invoker = true` (Postgres 15+).

```sql
ALTER VIEW carteira_lojista SET (security_invoker = true);
```

Isso faz a view respeitar RLS das tabelas `pedidos`, `saques`, `debitos_lojista` para o user que consulta. Como lojista só vê pedidos do próprio estabelecimento, ele só vê o próprio saldo. Admin vê tudo naturalmente.

## 4. Gestão de segredos

### 4.1 Variáveis por ambiente

| Segredo | Onde vive | Quem acessa |
|---|---|---|
| `SUPABASE_URL` | `.env` no cliente + no admin + Edge Functions | Todos |
| `SUPABASE_ANON_KEY` | `.env` no cliente + no admin + Edge Functions | Todos |
| `SUPABASE_SERVICE_ROLE_KEY` | **Apenas Edge Functions** (env do Supabase) | Nunca no app mobile |
| `ASAAS_API_KEY` | Env das Edge Functions | Só backend |
| `ASAAS_WEBHOOK_TOKEN` | Env das Edge Functions | Só backend (valida header do webhook) |
| `ZENVIA_API_TOKEN` | Env das Edge Functions | Só backend |
| `EXPO_ACCESS_TOKEN` | GitHub Actions Secret | Só CI para builds |

**Regra absoluta**: nada de `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY` ou `ZENVIA_API_TOKEN` no bundle dos apps mobile. Se aparecer em `apps/cliente/` ou `apps/lojista/`, é vulnerabilidade crítica.

### 4.2 Rotação

- Chaves Asaas e Zenvia: rotacionar a cada 6 meses ou imediatamente após qualquer suspeita de vazamento.
- `SUPABASE_SERVICE_ROLE_KEY`: rotacionar via Supabase Dashboard; atualizar env das Edge Functions e do CI.
- `ASAAS_WEBHOOK_TOKEN`: rotacionar sempre que reconfigurar webhook no Asaas.

### 4.3 Criptografia at-rest da chave PIX e chave Asaas do lojista

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
- Verificação no lojista digitando: Edge Function `confirmar-pin` recebe `pin_digitado`, faz `SELECT pin_hash FROM pedidos WHERE id = $1` e compara com `crypt(pin_digitado, pin_hash) = pin_hash`.

**Alternativa considerada e descartada**: guardar só o hash (sem `pin_texto`). Descartada porque o cliente precisa ver o código na tela — não há como derivar do hash. Compromisso aceito: `pin_texto` protegido por RLS (cliente vê o próprio; ninguém mais).

## 5. Autenticação admin

- Admin usa **mesmo Supabase Auth** que cliente e lojista (email + senha).
- Diferença: existência em `admin_users` (adicionada manualmente via SQL do owner).
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

- **Zenvia SMS**: max 3 códigos por telefone por hora — implementado em Edge Function.
- **Login**: Supabase Auth já tem proteção nativa contra brute-force (delay progressivo).
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
- [ ] Testar SMS com telefone repetindo — deve bloquear na 4ª tentativa/hora.
- [ ] Confirmar botão "excluir minha conta" abre WhatsApp com mensagem correta em iOS e Android.

## 9. O que fica para depois (v2+)

- 2FA para admin.
- Rate limiting customizado (Cloudflare ou similar) se abusos aparecerem.
- Encryption-at-rest total do banco (Supabase já faz por padrão via disk encryption; explicitamente comunicado nas Políticas).
- Certificate pinning nos apps mobile.
- Bug bounty / pentest formal.
