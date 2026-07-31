# 07 — Plano de execução do MVP piloto

Este documento é a fonte de verdade para **prioridade e profundidade de
backend**. Os épicos originais continuam sendo a fonte funcional e histórica.

## Norte do produto

- Interface: preservar o protótipo e o acabamento já construído.
- Backend: implementar primeiro apenas o necessário para uma operação piloto
  de até aproximadamente 200 usuários.
- Core: autenticação, catálogo, descoberta, PIX, pedido, aceite, PIN, histórico
  e operação administrativa.
- Operação humana é aceita quando estiver explícita na interface e registrada
  no banco.

## Política de preservação da interface

- Componentes, assets e rotas existentes não são apagados por esta revisão.
- `SIMPLE` mantém a tela e troca automação por uma ação manual rastreável.
- `UI_ONLY` mantém a tela alimentada por dados derivados, sem criar um
  subsistema exclusivo.
- `LATER` mantém o código e o desenho recuperáveis, mas não pode simular sucesso.
  Se a função aparecer no build do piloto, deve comunicar honestamente a
  indisponibilidade ou oferecer a alternativa manual aprovada.
- A única limitação visível relevante do recorte atual é cartão: o layout pode
  permanecer, mas PIX é o único meio de pagamento ativo no piloto.

## Vocabulário de planejamento

| Estado | Significado |
|---|---|
| `DONE` | Entregue; não reabrir por causa desta correção de curso. |
| `CORE` | Implementar com backend real no piloto. |
| `SIMPLE` | Preservar a interface e entregar backend direto/manual, sem automação avançada. |
| `UI_ONLY` | Preservar apresentação; dado pode ser derivado de queries simples, sem subsistema próprio. |
| `LATER` | Não bloquear o piloto; manter história e código de interface para retomada. |
| `REMOVED` | Removido por decisão anterior, mas preservado por rastreabilidade. |

## Matriz resumida de requisitos

Esta matriz evita a interpretação de que um FR preservado precisa receber toda
a automação já no piloto.

| Tratamento | Requisitos |
|---|---|
| `CORE` | FR1, FR3–FR4, FR6–FR10, FR14–FR18, FR21–FR24, FR26, FR28–FR31, FR33–FR34, FR36, FR38–FR40, FR42–FR45, FR47, FR49, FR51–FR53, FR55, FR57–FR58, FR60 |
| `SIMPLE` | FR5, FR11, FR13, FR19–FR20, FR27, FR32, FR35, FR37, FR41, FR46, FR48, FR50, FR54 |
| `LATER` | FR12, FR25, FR56, FR59 |
| `REMOVED` | FR2 |

Todos os NFRs de segurança, autorização, integridade, custo e compliance
continuam válidos. O NFR12 cobre no piloto apenas as regras `CORE` ou `SIMPLE`
ativadas; testes de Haversine, cartão e chargeback acompanham a retomada dessas
capacidades. O NFR13 pode continuar com gate local equivalente enquanto o
GitHub Actions estiver indisponível, conforme decisão já registrada no Épico 1.

## Matriz por Story

### Épico 0 — Casca visual

| Stories | Estado | Observação |
|---|---|---|
| 0.1–0.13 | `DONE` | Interface, navegação, mocks e ports preservados integralmente. |

### Épico 1 — Fundação

| Story | Estado | Backend do piloto |
|---|---|---|
| 1.1–1.7 | `DONE` | Entregues ou absorvidas pelo Épico 0. |
| 1.8 | `CORE` | Concluir deploy básico do Admin; sem infraestrutura adicional. |
| 1.9 | `DONE` | Esqueleto Supabase preservado. |
| 1.10 | `DONE` | Reconciliação das ports preservada. |

### Épico 2 — Auth Cliente

| Story | Estado | Backend do piloto |
|---|---|---|
| 2.1–2.3 | `DONE` | Inclui corretivas 2.1.1, 2.2.1 e 2.3.1. |
| 2.4–2.5 | `REMOVED` | SMS já removido; documentos e tela órfã continuam arquivados. |
| 2.5.1 | `CORE` | Bootstrap único do cliente Supabase no Expo; pré-requisito técnico de 2.6. |
| 2.6 | `CORE` | Login real por e-mail e senha. |
| 2.7 | `CORE` | Recuperação nativa do Supabase por e-mail. |
| 2.8 | `CORE` | Perfil real com edição básica. |
| 2.9 | `SIMPLE` | Configurações incorporadas ao Perfil; exclusão via WhatsApp/admin. |
| 2.10 | `CORE` | Deep link de suporte por WhatsApp. |
| 2.11 | `LATER` | Push nativo adiado; usar refresh/polling no pedido ativo. |

### Épico 3 — Lojista e aprovação

| Story | Estado | Backend do piloto |
|---|---|---|
| 3.1–3.2 | `CORE` | Onboarding e conta real. |
| 3.3 | `SIMPLE` | Validar formato e duplicidade; conferência humana no Admin. BrasilAPI fica opcional. |
| 3.4–3.7 | `CORE` | Cadastro operacional, estado em análise e aprovação pelo Admin. |
| 3.8 | `SIMPLE` | Aprovar lojista sem exigir criação automática de subconta Asaas. |
| 3.9–3.11 | `CORE` | Rejeição, login por status e perfil público. |
| 3.12 | `SIMPLE` | Configurações essenciais e exclusão via atendimento. |

### Épico 4 — Hubs e catálogo

| Story | Estado | Backend do piloto |
|---|---|---|
| 4.1 | `SIMPLE` | CRUD direto para poucos hubs; sem mapa ou geocoding. |
| 4.2–4.6 | `CORE` | Consulta e CRUD real de catálogo. |
| 4.7 | `SIMPLE` | Horários semanais básicos, sem motor sofisticado de calendário. |
| 4.8 | `CORE` | Pausa manual da loja. |

### Épico 5 — Descoberta e busca

| Story | Estado | Backend do piloto |
|---|---|---|
| 5.1 | `SIMPLE` | Lista de hubs; sem GPS, mapa ou Haversine. |
| 5.2–5.5 | `CORE` | Lojas, estados, catálogo e produto com dados reais. |
| 5.6–5.7 | `SIMPLE` | Busca case-insensitive do PostgreSQL; sem ranking especializado. |
| 5.8 | `UI_ONLY` | Estrela permanece decorativa, sem sistema de avaliações. |

### Épico 6 — Pedido e PIN

| Story | Estado | Backend do piloto |
|---|---|---|
| 6.1–6.2 | `CORE` | Carrinho de uma loja e resumo do checkout. |
| 6.3 | `SIMPLE` | Validação síncrona no checkout; sem job dedicado. |
| 6.4–6.7 | `CORE` | Ticket, CPF, geração de PIN e tela do PIN. |
| 6.8 | `SIMPLE` | Lista atualizada por polling/refresh, sem push. |
| 6.9 | `CORE` | Aceite e tempo estimado. |
| 6.10 | `LATER` | Timeout automático; Admin apenas sinaliza pedidos vencidos no piloto. |
| 6.11–6.12 | `CORE` | Recusa e avanço manual de estado. |
| 6.13 | `SIMPLE` | Cliente percebe mudança por polling/refresh, sem push. |
| 6.14 | `SIMPLE` | Um check-in operacional; não exige sincronização dos dois devices. |
| 6.15–6.17 | `CORE` | PIN server-side, recibo e histórico. |
| 6.18 | `SIMPLE` | Automático antes do aceite; depois, solicitação para o Admin. |
| 6.19–6.21 | `SIMPLE` | Registrar ocorrência e resolver manualmente; sem percentuais automáticos. |

### Épico 7 — Pagamento e carteira

| Story | Estado | Backend do piloto |
|---|---|---|
| 7.1–7.2 | `CORE` | Cliente Asaas e cobrança PIX. |
| 7.3–7.4 | `LATER` | Cartão, cartões salvos e tokenização; interface preservada para retomada. |
| 7.5 | `CORE` | Webhook `PAYMENT_RECEIVED`, autenticado e idempotente. |
| 7.6–7.7 | `CORE` | Ledger/saldo básico e tela da carteira. |
| 7.8 | `SIMPLE` | Criar solicitação; Admin executa PIX e registra conclusão. |
| 7.9 | `CORE` | Extrato simples do ledger. |
| 7.10 | `SIMPLE` | Agregações SQL diretas para preencher o dashboard existente. |
| 7.11 | `LATER` | Automação de chargeback; ocorrência é tratada manualmente no piloto. |
| 7.12 | `CORE` | Taxa calculada e registrada no pedido/ledger. |

### Épico 8 — Admin

| Story | Estado | Backend do piloto |
|---|---|---|
| 8.1 | `CORE` | Fila real de solicitações e ocorrências. |
| 8.2 | `SIMPLE` | Admin executa no gateway e registra o resultado. |
| 8.3 | `CORE` | Lista e filtros diretos. |
| 8.4 | `SIMPLE` | Forçar estado e criar pendência financeira, sem cadeia automática. |
| 8.5–8.6 | `CORE` | Busca/bloqueio de cliente e suspensão de lojista. |
| 8.7 | `SIMPLE` | Métricas por queries SQL; sem plataforma analítica. |
| 8.8 | `SIMPLE` | Lista de ocorrências registradas; sem score automatizado. |

### Épico 9 — Publicação

| Stories | Estado | Observação |
|---|---|---|
| 9.1–9.11 | `CORE` | Publicação, compliance, smoke manual e produção continuam obrigatórios. |

## Ordem de execução

1. Fechar Auth Cliente (2.6–2.10, exceto push).
2. Entregar Lojista/Admin básico (3.x).
3. Ligar hubs, catálogo e descoberta (4.x–5.x).
4. Entregar o pedido sem pagamento (6.x) usando ambiente de desenvolvimento.
5. Ligar PIX e ledger (7.1–7.2, 7.5–7.9, 7.12).
6. Completar operação Admin (8.x).
7. Publicar e validar o piloto (9.x).

Uma Story `LATER` não deve ser puxada enquanto houver Story `CORE` anterior na
fatia vertical, salvo decisão explícita registrada no Change Log do PRD.
