# 05 — Epic List

O MVP é entregue em **10 épicos**. Cada épico entrega valor demonstrável e sustenta o próximo.

> **Correção de curso (2026-07-31):** nenhum épico ou Story foi apagado. A
> interface permanece. A profundidade do backend de cada Story agora é regida
> por [`07-plano-mvp-piloto.md`](./07-plano-mvp-piloto.md); itens `LATER`
> permanecem recuperáveis em [`08-backlog-pos-piloto.md`](./08-backlog-pos-piloto.md).

> **Reorganização (2026-07-27) — estratégia UI-first.** Adicionado o **Épico 0 (Casca Visual)**, que constrói **todas as telas dos 3 apps com dados mock** e fidelidade total ao protótipo, através de uma camada de dados assíncrona trocável (`packages/core-data`). O antigo Épico 1 foi reduzido e renomeado para **"Fundação Backend & CI"**. Os Épicos 2–9 **mantêm número e goal**, mas seu escopo passa de "construir tela + lógica" para **"plugar backend real na tela já existente"** (trocar mock por Supabase, ligar auth/pagamento/RLS). Detalhes em [`epics/0-casca-visual.md`](./epics/0-casca-visual.md).

## Lista de épicos

| # | Épico | Goal statement (1 sentença) |
|---|---|---|
| 0 | [Casca Visual (UI-first)](./epics/0-casca-visual.md) | Construir todas as telas dos 3 apps com dados mock e fidelidade total ao protótipo, navegáveis ponta-a-ponta, sobre uma camada de dados assíncrona trocável (`packages/core-data`). |
| 1 | [Fundação Backend & CI](./epics/1-setup-fundacao.md) | Projeto Supabase na nuvem, wrapper `supabase-client` tipado, esqueleto Supabase das ports de `core-data`, e CI garantindo qualidade — pronto para substituir os mocks por dados reais. |
| 2 | [Auth & Onboarding do Cliente](./epics/2-auth-cliente.md) | Cliente consegue baixar o app, criar conta com e-mail + senha (telefone opcional e não verificado), logar, recuperar senha e ver seu perfil — com fidelidade visual ao protótipo. Sem confirmação por SMS (decisão 10.4). |
| 3 | [Auth & Onboarding do Lojista + Aprovação Admin](./epics/3-lojista-aprovacao.md) | Lojista se cadastra; admin aprova; lojista aprovado acessa o painel. Subconta automática não bloqueia o piloto. |
| 4 | [Cadastros Base — Hubs & Catálogo](./epics/4-cadastros-base.md) | Admin cadastra hubs; lojista cadastra produtos com fotos, define horários e ticket mínimo; base pronta para receber pedidos. |
| 5 | [Descoberta & Busca do Cliente](./epics/5-descoberta-busca.md) | Cliente escolhe hub em lista, vê lojas e catálogos reais e busca por produto ou loja com consulta simples. |
| 6 | [Pedido & PIN](./epics/6-pedido-pin.md) | Ciclo central carrinho → aceite → hub → PIN → recibo; exceções complexas viram ocorrências operadas pelo Admin. |
| 7 | [Pagamento & Carteira](./epics/7-pagamento-carteira.md) | PIX e webhook reais, ledger básico e carteira visual; cartão e automações financeiras ficam no backlog preservado. |
| 8 | [Painel Admin — Operação](./epics/8-admin-operacao.md) | Admin opera o dia a dia: fila de reembolsos manuais, cancelamento forçado, bloqueio de cliente, suspensão de lojista, dashboard financeiro geral. |
| 9 | [Publicação & Compliance](./epics/9-publicacao-compliance.md) | Preparar e submeter os apps às lojas: Termos, LGPD/exclusão, ícones, splash, metadata, migração dev→produção, submissão App Store + Play Store. |

## Dependências entre épicos

```
Épico 0 (Casca Visual) ──────────────┐
                                      ├─► Épicos 2–9 (plugar backend nas telas existentes)
Épico 1 (Fundação Backend & CI) ──────┘   (Épico 1 pode começar após a Story 0.2 — ports)

Dentro de 2–9, mantêm-se as dependências originais:
   Épico 2 (Cliente Auth) ─┐
   Épico 3 (Lojista + Admin Auth) ─┼─► Épico 4 (Cadastros base)
                                   │      └─► Épico 5 (Descoberta) ─┐
                                   │      └─► Épico 6 (Pedido & PIN) ─┼─► Épico 8 (Admin Operação)
                                   │             └─► Épico 7 (Pagamento) ─┘
                                   └─► Épico 9 (Publicação — depende de tudo)
```

- **Sequência recomendada (dev solo):** Épico 0 completo primeiro (produto navegável para validar UX/fidelidade cedo) → Épico 1 (backend + CI), podendo iniciar assim que a Story 0.2 existir → Épicos 2–9 na ordem original, agora como *swap* mock→real tela por tela.
- Épicos 2 e 3 podem ser trabalhados em paralelo após o 1 (times separados). Em cenário solo dev, executar em sequência.
- Épico 4 só começa após 2 e 3 (precisa das auth e do admin).
- Épico 5 depende de 4 (catálogo precisa existir para descobrir).
- Épico 6 depende de 4 e 5.
- Épico 7 depende de 6 (pedido precisa existir para gerar cobrança).
- Épico 8 depende de 6 e 7 (admin precisa dos estados para operar).
- Épico 9 depende de tudo — é o "empurrar pra loja".

## Cross-cutting concerns

Não são épicos separados, mas devem ser mantidos vivos em todos:

- **Fidelidade visual** ao protótipo — validar em cada tela.
- **Testes unitários** das regras críticas — adicionar junto com o código.
- **Atualização de pedido** — polling/refresh no piloto; push é retomado quando a operação demonstrar necessidade.
- **RLS** — cada tabela nasce com RLS ativado e políticas escritas na mesma Story que cria a tabela.
- **Business rules em `packages/config`** — todo valor placeholder (12%, R$ 200, R$ 40, R$ 20, 10 min, 5 tentativas, 7 dias) vem de um único arquivo, nunca hard-coded no meio do código.
- **Camada de dados em `packages/core-data`** — telas consomem apenas *ports* assíncronas (nunca a implementação direta). Épico 0 usa a implementação mock; a partir do Épico 1 a mesma port ganha implementação Supabase e a troca é por flag (`DATA_SOURCE`), sem reescrever tela. As ports espelham o schema de `docs/architecture/03-data-models.md`.
