# Épico 5 — Descoberta & Busca do Cliente

## Expanded Goal

Dar ao cliente a **experiência de descoberta** completa: escolher um hub próximo, ver lojas do hub filtradas por raio de atendimento e horário, navegar catálogos, ver detalhes de produtos, e buscar por produto ou por loja. Ao final: o cliente tem tudo que precisa para achar o que quer comprar. O carrinho e o checkout são do Épico 6.

## Prerequisites

- Épico 2 (cliente logado).
- Épico 4 (hubs e produtos cadastrados).

## Stories

### Story 5.1 — Home cliente: listar hubs próximos

**As a** cliente logado,
**I want** ver os hubs próximos ordenados por distância,
**so that** eu escolha onde retirar meu pedido.

**Acceptance Criteria:**
1: Tela "Home" replicando o protótipo (fundo claro, seção "Hubs perto de você" com cards horizontais rolando).
2: Solicita permissão de localização ao entrar (Expo Location).
3: Se aceitar: consulta `hubs`, calcula distância Haversine no client, ordena por distância crescente. Se recusar: pede endereço/CEP em input livre (usa geocoding grátis se disponível; senão exibe todos os hubs sem distância).
4: Cada card exibe: nome do hub, endereço curto, distância ("Rua das Flores, 120 · 2,1 km"), badge status ("Aberto até 22h" / "Fechado").
5: Toque no card avança para Story 5.2.

---

### Story 5.2 — Tela do hub: listar lojas do hub

**As a** cliente,
**I want** ver as lojas disponíveis no hub que escolhi,
**so that** eu decida onde comprar.

**Acceptance Criteria:**
1: Tela replica o protótipo: header com nome do hub, seção "Lojas perto do hub", cards de loja.
2: Edge Function `lojas-por-hub` retorna lojas cujo `hub` está dentro do raio de atendimento (calculado via Haversine entre `estabelecimento.lat/lng` e `hub.lat/lng`). Também aplica: `estabelecimento.status = 'ativo'`, `pausado_manualmente = false`, e estabelecimento aberto no horário atual (consulta `estabelecimentos_horarios`).
3: Cada card: nome, categoria, distância loja→hub, estado (Aberto / Fechado / Pausado — mas se Fechado/Pausado geralmente nem retorna). Ícone/foto de fachada.
4: Filtro rápido por categoria (chips horizontais: Todos, Farmácia, Alimentação, Vestuário, +demais).
5: Toque em uma loja avança para Story 5.4.

---

### Story 5.3 — Estados visuais da loja (Aberta / Fechada / Pausada)

**As a** cliente,
**I want** ver claramente o estado de cada loja no card,
**so that** eu não perca tempo entrando em loja que não vai atender agora.

**Acceptance Criteria:**
1: Loja "Aberta" com badge verde.
2: Loja "Fechada" (fora do horário) só é exibida se cliente estiver em modo "ver fechadas também" (opcional — MVP pode não mostrar fechadas). Recomendação: **não mostrar fechadas no MVP** (default: só abertas).
3: "Pausada" (botão manual do lojista): não aparece.
4: Regra combinada centralizada em Edge Function ou view SQL para reuso.

---

### Story 5.4 — Detalhe da loja + catálogo

**As a** cliente,
**I want** ver todos os produtos de uma loja com seus preços,
**so that** eu escolha o que comprar.

**Acceptance Criteria:**
1: Tela "Loja · catálogo" replica o protótipo: header com foto da loja + nome + categoria + distância + horário; seções de produto por categoria interna (ex: Cuidados, Higiene) com scroll vertical.
2: Cada produto exibe: foto, nome, preço, descrição curta (2 linhas), botão "Adicionar ao carrinho".
3: Botão "Falar com o lojista" no header abre WhatsApp do lojista.
4: Ticket mínimo da loja exibido em algum lugar visível ("Pedido mínimo: R$ 25").
5: Taxa de deslocamento exibida também para clareza pré-checkout.

---

### Story 5.5 — Detalhe do produto

**As a** cliente,
**I want** ver detalhes de um produto (foto grande, descrição completa, quantidade),
**so that** eu decida quanto comprar.

**Acceptance Criteria:**
1: Tela "Detalhe do produto" replica o protótipo: foto grande, nome, preço, descrição, seletor de quantidade (+/-), botão "Adicionar ao carrinho" fixo no rodapé.
2: Se produto do carrinho já contém este item, mostra "Já no carrinho: N" e permite atualizar.

---

### Story 5.6 — Busca: resultados por produto

**As a** cliente,
**I want** buscar por nome de produto e ver todas as lojas que vendem no hub atual,
**so that** eu compare preços e encontre o que quero rápido.

**Acceptance Criteria:**
1: Tela de busca acessível via ícone no header da home.
2: Input com placeholder "Buscar produto ou loja".
3: Resultado quando o termo bate com nome de produto: lista de cards produto (miniatura, nome, preço, loja, distância). Ordenação: preço crescente ou por relevância — MVP usa ILIKE simples + ordenação por preço.
4: Toque no card abre detalhe do produto (Story 5.5).
5: Busca é escopada ao **hub selecionado atualmente** — se o cliente ainda não escolheu hub, força escolha antes.

---

### Story 5.7 — Busca: resultados por loja

**As a** cliente,
**I want** buscar por nome de loja e ir direto ao catálogo,
**so that** eu encontre uma loja específica que já conheço.

**Acceptance Criteria:**
1: Mesma tela de busca da Story 5.6.
2: Se o termo bate com nome de loja, exibe cards de loja acima dos de produto.
3: Toque no card de loja abre Story 5.4 (catálogo).
4: Se termo bate com ambos, exibe seção "Lojas" e "Produtos" separadas.

---

### Story 5.8 — Placeholder de estrela / rating (visual apenas)

**As a** cliente,
**I want** ver estrelas nos cards de loja como no protótipo,
**so that** o visual não fique quebrado — mesmo que avaliações estejam fora do MVP.

**Acceptance Criteria:**
1: Cada loja exibe "★ {valor}" onde `valor` é constante `4.5` (mock uniforme) — não vem do banco.
2: Comentário no código indica: "MVP-mock — implementar sistema de avaliação na v2".
3: Sem tela de escrever avaliação. Sem sistema de agregação.

---

## Definition of Done

- [ ] Todas as 8 stories `Done`.
- [ ] Cliente consegue: entrar → home → escolher hub → filtrar categoria → ver lojas → entrar em loja → ver produtos → buscar produto e loja.
- [ ] Regras de disponibilidade (raio + horário + pausado) funcionam corretamente.
- [ ] Fidelidade visual validada em cada tela.
