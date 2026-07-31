# Sprint Change Proposal — frontend completo, backend essencial

**Data:** 2026-07-31
**Modo:** YOLO em lote
**Status:** aprovado pelo responsável do projeto e aplicado aos artefatos
**Marco anterior:** `backup/pre-mvp-backend-simplification-2026-07-31`

## 1. Gatilho e problema

O planejamento original descreve um produto adequado a uma operação comercial
mais madura: cartão tokenizado, push, jobs de timeout, subcontas, saques
automáticos, chargeback automático, geolocalização e regras extensas de
exceção. Para um piloto de até aproximadamente 200 usuários, isso concentra
esforço no backend antes da validação do fluxo principal.

A interface já representa valor e diferenciação do produto. Portanto, a
correção de curso não reduz a qualidade visual: ela troca automações prematuras
por operações simples, explícitas e auditáveis.

## 2. Caminho escolhido

Adotar uma fatia vertical operacional:

`descobrir → comprar com PIX → aceitar → levar ao hub → confirmar PIN → registrar repasse`

Regras:

1. Toda tela mantida no piloto deve ter navegação, estados de loading, vazio e
   erro, além de uma ação honesta. Não pode haver sucesso fictício.
2. Uma ação complexa pode criar uma solicitação para o admin ou abrir WhatsApp,
   desde que o usuário veja o estado real da solicitação.
3. Automação adiada permanece documentada com o mesmo identificador de FR e de
   Story, para ser retomada sem reconstruir contexto.
4. Segurança, RLS, idempotência de pagamento, validação server-side do PIN e
   rastreabilidade financeira não são simplificáveis.

## 3. Impacto nos épicos

| Épico | Decisão |
|---|---|
| 0 — Casca visual | Mantido integralmente; já entregue. |
| 1 — Fundação | Mantido; concluir apenas publicação/configuração essencial. |
| 2 — Auth Cliente | Manter UX; adiar somente push nativo. |
| 3 — Lojista/Admin | Manter UX; CNPJ e repasse podem ter validação/operação manual. |
| 4 — Hubs/Catálogo | Manter; poucos hubs e regras diretas. |
| 5 — Descoberta | Manter UI; lista explícita e busca SQL simples, sem geolocalização. |
| 6 — Pedido/PIN | Manter fluxo central; substituir jobs, push e exceções automáticas por estados e operação manual. |
| 7 — Pagamento/Carteira | PIX real; cartão, tokenização e chargeback automático ficam preparados para retomada. Saque vira solicitação manual. |
| 8 — Admin | Manter telas; queries diretas e ações operacionais simples. |
| 9 — Publicação | Mantido, pois é necessário para validar o produto real. |

## 4. Artefatos afetados

- PRD: nova política de execução e matriz por Story.
- Requisitos: os FRs originais permanecem; a matriz informa se cada um é
  completo, simplificado, manual ou posterior.
- Épicos: recebem um cabeçalho comum apontando para a matriz vigente.
- Arquitetura: novo overlay de piloto, que prevalece em conflitos com a
  arquitetura original.
- Histórias concluídas: permanecem imutáveis e `Done`.
- Histórias futuras: mantêm número e texto histórico; a implementação deve
  seguir a classificação do plano do piloto.

## 5. Critérios de sucesso

- Os três frontends mantêm acabamento visual e não possuem ações silenciosas ou
  sucessos falsos.
- O caminho PIX + pedido + aceite + PIN funciona com dados reais.
- Reembolsos e repasses manuais têm registro de status e autoria.
- Uma Story adiada pode ser retomada localizando seu identificador no PRD, no
  épico original e no backlog futuro.
- Nenhum segredo de gateway ou `service_role` chega aos bundles dos apps.

## 6. Rollback e retomada

O estado anterior pode ser consultado ou aberto em worktree separado seguindo
[`docs/archive/README.md`](./archive/README.md). O backlog pós-piloto está em
[`docs/prd/08-backlog-pos-piloto.md`](./prd/08-backlog-pos-piloto.md).
