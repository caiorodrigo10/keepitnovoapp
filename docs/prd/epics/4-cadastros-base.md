# Épico 4 — Cadastros Base (Hubs & Catálogo)

> **Plano vigente (2026-07-31):** manter hubs e catálogo reais com CRUD direto,
> poucos hubs e sem motor geográfico. Ver
> [`../07-plano-mvp-piloto.md`](../07-plano-mvp-piloto.md).

## Expanded Goal

Preencher o "estoque de dados" que sustenta a operação: **admin cadastra hubs** e **lojista cadastra produtos**. Ao final: existem hubs cadastrados com localização e horário; existem produtos com foto, preço e descrição; existem horários de funcionamento configurados. Sistema pronto para o cliente descobrir (Épico 5) e fazer pedidos (Épico 6).

## Prerequisites

- Épico 3 concluído (admin logado; lojistas aprovados).

## Stories

### Story 4.1 — Admin: CRUD de hubs

**As a** admin Keepit,
**I want** criar, editar e excluir hubs,
**so that** os lojistas e clientes tenham hubs disponíveis para operar.

**Acceptance Criteria:**
1: Rota `/admin/hubs` com lista e botão "Novo hub".
2: Formulário: nome, endereço completo, latitude/longitude (input manual — sem mapa), horário por dia da semana (checkbox aberto + hh:mm abertura + hh:mm fechamento), ponto de referência (textarea livre para descrição operacional tipo "balcão à direita do shopping"), foto opcional (upload Supabase Storage bucket `hubs`).
3: Migration cria tabela `hubs (id uuid PK, nome text, endereco text, lat numeric, lng numeric, ponto_referencia text, foto_url text nullable, criado_em timestamptz)` + tabela filha `hubs_horarios (hub_id, dia_semana int 0-6, hora_abre time, hora_fecha time, aberto bool)`.
4: Editar e excluir funcionam. Excluir só permitido se nenhum pedido em aberto no hub.
5: RLS: `SELECT` público (cliente consulta); `INSERT`/`UPDATE`/`DELETE` só para `admin_users`.

---

### Story 4.2 — Cliente: consultar hubs (leitura pública)

**As a** cliente,
**I want** que o app consulte a lista de hubs disponíveis do Supabase,
**so that** o cliente possa escolher no Épico 5.

**Acceptance Criteria:**
1: Query pública em `hubs` disponível para clientes autenticados.
2: Retorno inclui horários.
3: Endpoint (via `supabase-client`) tipado com `shared-types`.

*(A UI de escolha de hub é do Épico 5. Esta story só garante o dado disponível.)*

---

### Story 4.3 — Lojista: tela "Gerenciar catálogo"

**As a** lojista ativo,
**I want** ver todos meus produtos cadastrados com foto, nome, preço e estado (ativo/pausado),
**so that** eu tenha visão completa do meu catálogo.

**Acceptance Criteria:**
1: Rota "Catálogo" no app do lojista replicando o protótipo (lista compacta, cards com foto pequena + nome + preço + estoque texto se tiver).
2: Tabs ou filtros: Ativos / Pausados.
3: Botão flutuante "+" para adicionar produto (Story 4.4).
4: Cada card tem menu (editar / pausar / excluir).

---

### Story 4.4 — Lojista: cadastrar produto com upload de foto

**As a** lojista,
**I want** cadastrar um produto informando nome, descrição, preço, categoria e foto,
**so that** ele apareça no meu catálogo.

**Acceptance Criteria:**
1: Formulário: nome, descrição curta (max 300 chars), preço em R$, categoria de produto (dropdown de lista aberta em config, ex.: Cuidados, Higiene, Alimentos, Bebidas, Roupas, Acessórios), foto (upload — permite câmera ou galeria).
2: Migration cria tabela `produtos (id uuid PK, estabelecimento_id uuid FK, nome text, descricao text, preco numeric(10,2), categoria text, foto_url text, ativo bool default true, criado_em timestamptz)`.
3: RLS: lojista só vê/edita seus produtos; SELECT público para clientes autenticados (com filtro `ativo = true`).
4: Foto salva em bucket `produtos` com URL assinada.
5: Compressão de imagem client-side antes do upload (max 1200px lado maior).

---

### Story 4.5 — Lojista: editar produto

**As a** lojista,
**I want** editar nome, descrição, preço, categoria ou foto de um produto,
**so that** eu mantenha o catálogo atualizado.

**Acceptance Criteria:**
1: Formulário reusa Story 4.4 preenchido com dados atuais.
2: Alterações aplicadas imediatamente.
3: RLS impede editar produto de outro lojista.

---

### Story 4.6 — Lojista: pausar / excluir produto

**As a** lojista,
**I want** pausar ou excluir um produto,
**so that** ele saia do catálogo do cliente.

**Acceptance Criteria:**
1: Pausar: `UPDATE produtos SET ativo = false`. Produto some do catálogo do cliente mas continua na lista do lojista (tab "Pausados").
2: Excluir: soft delete (`SET excluido_em = NOW()`). Não permitido se há pedidos em aberto envolvendo o produto.
3: Confirmação antes de excluir.

---

### Story 4.7 — Lojista: horários & disponibilidade

**As a** lojista,
**I want** configurar meus horários de funcionamento por dia da semana,
**so that** o app do cliente saiba quando estou aberto.

**Acceptance Criteria:**
1: Tela "Horários & disponibilidade" replicando o protótipo (linhas Seg / Ter / ... / Dom, com toggle "aberto" e horários).
2: Migration cria tabela `estabelecimentos_horarios (estabelecimento_id, dia_semana int, hora_abre time, hora_fecha time, aberto bool)`.
3: Salvar aplica imediatamente.
4: Estado exibido no card da loja no app do cliente: "Aberto até 22h" / "Fechado".

---

### Story 4.8 — Lojista: botão "Pausar novos pedidos" (fechado agora)

**As a** lojista,
**I want** um botão para fechar temporariamente sem editar horários,
**so that** eu possa parar de receber pedidos rapidamente em imprevistos.

**Acceptance Criteria:**
1: Toggle "Pausar novos pedidos" na tela de horários (e possivelmente no dashboard) — replica protótipo.
2: Ativa flag `estabelecimentos.pausado_manualmente = true`.
3: Enquanto ativa, loja não aparece no catálogo do cliente (independente do horário programado).
4: Ao desativar, volta a operar imediatamente.
5: Pedido já aceito não é afetado (segue seu ciclo normal).

---

## Definition of Done

- [ ] Todas as 8 stories `Done`.
- [ ] Admin criou pelo menos 1 hub de teste com endereço e horário.
- [ ] Lojista de teste cadastrou pelo menos 3 produtos com foto e configurou horários.
- [ ] RLS validada — tentativa cross-tenant retorna erro.
- [ ] Botão "Pausar novos pedidos" testado.
