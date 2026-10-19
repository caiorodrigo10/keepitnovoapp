# 04 — Technical Assumptions

> **Overlay vigente do piloto (2026-07-31):** stack, monorepo, Supabase, RLS e
> contratos continuam válidos. A quantidade de Edge Functions e automações foi
> reduzida conforme
> [`../architecture/07-mvp-pilot-backend.md`](../architecture/07-mvp-pilot-backend.md).
> Esse documento prevalece em conflitos de profundidade: PIX antes de cartão,
> polling antes de push, solicitações manuais antes de saque/reembolso
> automático, lista de hubs antes de GPS/Haversine.

Todas as decisões técnicas do MVP. Estas se tornam **restrições para o Architect e o Dev**. Detalhamento completo em `docs/ARQUITETURA.md`.

## Repository Structure: Monorepo

Um único repositório com **pnpm workspaces + Turborepo**, organizando os 4 projetos e os 3 packages compartilhados:

```
keepitnovoapp/
├── apps/
│   ├── cliente/         Expo (iOS + Android)
│   ├── lojista/         Expo (iOS + Android)
│   ├── admin/           Next.js (web, hospedado na Vercel)
│   └── supabase/        migrations SQL + edge functions
└── packages/
    ├── shared-types/    tipos TypeScript gerados a partir do schema Supabase
    ├── supabase-client/ wrapper tipado do supabase-js compartilhado
    └── ui-tokens/       paleta, tipografia, tokens do design system + assets
```

**Racional**: monorepo permite compartilhar tipos (evita erro de contrato entre app e backend), tokens de design (garante fidelidade visual entre cliente/lojista/admin) e cliente Supabase (uma única fonte de verdade de auth e queries).

## Service Architecture: Monolítico via Supabase (Backend-as-a-Service)

- **Backend**: **Supabase** entrega PostgreSQL + Auth + Storage + Edge Functions + Row-Level Security em um único serviço gerenciado. Não há backend Node/Fastify separado.
- **Regras privilegiadas ou com segredos** rodam em **Edge Functions Deno**.
  CRUD comum usa `supabase-js` + RLS. No piloto, as funções mínimas são cobrança
  PIX, webhook de pagamento, confirmação de PIN e ação financeira administrativa.
- **Autorização** vive em **RLS** (Row-Level Security). Cliente vê só seus pedidos; lojista vê só o que é do seu estabelecimento; admin tem acesso amplo. Nenhuma regra crítica de autorização vive só no client-side.
- **Storage**: fotos de produto, foto de fachada, foto de hub em **Supabase Storage** com URLs assinadas.
- **Jobs / cron**: não são pré-requisito do piloto. Pedidos vencidos aparecem
  sinalizados no Admin; o job automático permanece no backlog pós-piloto.

**Racional**: Supabase entrega tudo que precisamos com **um único fornecedor**, free tier suficiente para o MVP, e reduz drasticamente o esforço vs. um backend Node customizado. Autoriza por linha do banco, o que é ideal para o modelo cliente/lojista/admin.

## Pagamento: Asaas com ledger simples e operação assistida

- **Gateway**: **Asaas**, inicialmente para cobrança PIX e confirmação por webhook.
- **Modelo financeiro**: **carteira virtual** — dinheiro fica na conta master Keepit; saldo do lojista é calculado no banco (`entregue_em <= NOW() - 7 days` → disponível; caso contrário → bloqueado); saque dispara UMA transferência PIX externa da master direto para o banco do lojista.
- **Subconta, cartão, tokenização, chargeback e transferência automática** ficam
  preservados no backlog. No piloto, reembolso e repasse são executados pelo
  admin e registrados em ledger/solicitação auditável.

**Racional**: escolhido após avaliação técnica documentada em `docs/gateway/asaas.md` — sandbox aberto, sem burocracia de PSP, alinhado ao volume do MVP.

## Testing Requirements: Unit + regras críticas + smoke manual

- **Testes unitários obrigatórios no piloto** cobrindo: geração/validação de
  PIN, transições ativas do pedido, valores do ledger, validação temporal
  simplificada, taxa Keepit, taxa de deslocamento e ticket mínimo. Haversine,
  cartão e chargeback recebem testes quando saírem de `LATER`.
- **Testes de integração leves** para webhooks Asaas (payload esperado → estado do pedido).
- **Sem testes E2E automatizados no MVP**. Fluxos end-to-end validados manualmente pelo dev solo antes de cada release.
- **Smoke manual** obrigatório antes de submissão à App Store / Play Store.
- **QA agent do AIOX** aplicado em cada Story: revisão de código, checklist de aceitação, e verificação de regressão contra stories anteriores.

**Racional**: cobertura fica proporcional ao risco. Testar E2E automatizado dá overhead grande no cenário solo dev; testar unidade nas regras críticas dá segurança onde importa.

## Additional Technical Assumptions and Requests

- **Linguagem única**: TypeScript em todos os projetos (Expo, Next.js, Edge Functions Deno).
- **Cliente Supabase gerado**: usar `supabase gen types typescript` para manter `shared-types` sempre em sincronia com o schema.
- **Sem ORM adicional** (Prisma, Drizzle). Query builder do supabase-js + SQL cru quando necessário.
- **Migrations versionadas** em `apps/supabase/migrations/` — aplicadas manualmente com `supabase db push` no MVP.
- **CI**: GitHub Actions com `lint + typecheck + test` em cada PR. Sem deploy automático de Edge Functions no MVP (aplicar manualmente).
- **Deploy admin**: Vercel com deploy contínuo automático (main → produção).
- **Deploy mobile**: EAS Build + EAS Submit manuais quando quiser publicar. Sem EAS Update no MVP.
- **Ambientes**: 2 projetos Supabase distintos, **ambos hospedados na nuvem** (`keepit-dev` e `keepit-prod`). Sem staging. **Sem Supabase local via Docker/CLI** (decisão 2026-07-03 — solo dev, setup mais rápido).
- **Autenticação (Cliente, Lojista e Admin)**: **Supabase Auth nativo com e-mail + senha**. Recuperação de senha por e-mail. Não usa Supabase Auth Phone nem OTP por SMS. *(Se a confirmação de e-mail será obrigatória é a pendência **10.5**, ainda em aberto — ver `docs/PERGUNTAS_REGRAS_NEGOCIO.md`.)*
- ~~**Provider de SMS**: **Zenvia** (~R$ 0,08/SMS), disparado por Edge Function.~~
  > **Removido do MVP pela decisão 10.4 (2026-07-29)** — sem confirmação de telefone por SMS, não há provider de SMS no MVP. Nenhuma Edge Function, chave de ambiente (`ZENVIA_API_TOKEN`) ou dependência Zenvia deve ser criada. Candidato a v2. Ver FR2 em `02-requirements.md`.
- **Push notifications**: integração preservada para depois do piloto; pedido
  ativo usa polling moderado e refresh manual.
- **Validação de CNPJ**: formato, unicidade e conferência humana; BrasilAPI é
  opcional e não bloqueia cadastro/aprovação.
- **Sem provider de mapa e sem Haversine no piloto**. Hubs são listados e a
  relação loja↔hub é explícita.
- **Sem SDK oficial Node.js Asaas** — consumir REST direto com `fetch`.
- **Regras de negócio parametrizáveis** (12% da Keepit, R$ 200 saque mínimo, R$ 40 chargeback, R$ 20 ticket mínimo global, 10 min timeout aceite, 10 min janela hub, 5 tentativas PIN, 7 dias repasse) ficam em um arquivo `packages/config/business-rules.ts` versionado — **não** em variáveis de ambiente.
- **Termos de Uso e Política de Privacidade** apontam para páginas web da Keepit (URLs stub definidas em config; textos finais chegam do stakeholder/advogado antes do go-live).
- **Contador de marketplace** precisa ser contratado antes do go-live (não é software, mas é bloqueante para publicação — item de compliance).
- **Autenticação admin** via Supabase Auth com uma tabela `admin_users` que RLS consulta para autorizar acessos administrativos.
- **Erros e observabilidade** no MVP: logs padrão do Supabase suficientes. Sentry entra depois se houver necessidade real de tracking em produção.
