# 06 — Next Steps

> **Atualização de execução (2026-07-31):** antes de criar ou implementar uma
> Story, ler [`07-plano-mvp-piloto.md`](./07-plano-mvp-piloto.md) e
> [`../architecture/07-mvp-pilot-backend.md`](../architecture/07-mvp-pilot-backend.md).
> As ACs históricas continuam visíveis, mas a classificação `CORE`, `SIMPLE`,
> `UI_ONLY` ou `LATER` define o trabalho atual.
> A política operacional para criação e validação está em
> [`../stories/README.md`](../stories/README.md).
> A execução no Codex deve seguir
> [`../orchestration/CODEX-AIOX-MVP-ORCHESTRATION.md`](../orchestration/CODEX-AIOX-MVP-ORCHESTRATION.md).

Ao final do PRD, dois handoffs formais para os próximos agentes AIOX.

## Handoff para @architect (Aria)

**Contexto:** Você é o agente Architect do AIOX. Recebe este PRD e produz o **Architecture Document** técnico correspondente. Já existe um documento arquitetural em `docs/ARQUITETURA.md` — use como ponto de partida, refine e amplie no formato AIOX.

**Escopo:**
- Ler `docs/prd/*` (este PRD completo).
- Ler `docs/ARQUITETURA.md` (arquitetura já esboçada).
- Ler `docs/gateway/asaas.md` (decisão de gateway).
- Ler `keepit-app/index.html` (protótipo — para entender as telas que serão implementadas).

**Deliverables:**
1. `docs/architecture/01-system-design.md` — diagrama de contexto e componentes (Supabase, Asaas, Expo Push, os 3 apps). *(A **Zenvia** saiu da lista pela decisão 10.4, 2026-07-29: sem SMS no MVP — autenticação de Cliente, Lojista e Admin é e-mail + senha via Supabase Auth. Candidata a v2; não deve aparecer no diagrama de contexto do MVP.)*
2. `docs/architecture/02-tech-stack.md` — stack explícito com versões travadas de todas as bibliotecas.
3. `docs/architecture/03-data-models.md` — schema completo das tabelas Supabase, com relações, tipos, defaults, constraints, e políticas RLS por tabela. Use `packages/ui-tokens/schema-design-tmpl.yaml` como referência.
4. `docs/architecture/04-patterns.md` — padrões de código para Edge Functions, gestão de sessão no Expo, estrutura de pastas dentro de cada app, convenção de nomenclatura, tratamento de erros.
5. `docs/architecture/05-security.md` — RLS policies principais, gestão de segredos, criptografia de dados sensíveis (chave PIX, dados bancários), autenticação admin, prevenção de OWASP básicos.

**Restrições:**
- Fidelidade 100% ao stack decidido em `04-technical.md`. Não repropor stack.
- Ler `docs/PERGUNTAS_REGRAS_NEGOCIO.md` antes de modelar autenticação: a decisão **10.4** (2026-07-29) fecha e-mail + senha para os três perfis e tira o SMS/Zenvia do MVP; as pendências **10.5** (confirmação de e-mail obrigatória?) e **10.6** (provisionamento e papéis de admin) seguem **abertas** e afetam o desenho de auth.
- Não introduzir tecnologia nova sem justificar por que a decisão anterior não serve.
- Priorizar simplicidade. Cada decisão passa pelo filtro "solo dev consegue manter".

**Comando sugerido para iniciar:**
```
@architect
Leia docs/prd/*, docs/ARQUITETURA.md e docs/gateway/asaas.md.
Produza os 5 arquivos de arquitetura em docs/architecture/ conforme handoff no docs/prd/06-next-steps.md.
```

---

## Handoff para @sm (River)

**Contexto:** Você é o Scrum Master. Depois do Architect terminar, você recebe PRD + Architecture e transforma os épicos em **stories individuais em `docs/stories/`** no formato executável pelo @dev.

**Escopo:**
- Ler `docs/prd/*` (PRD completo, incluindo 9 arquivos de épico).
- Ler `docs/architecture/*` (arquitetura pronta).
- Ler `.aiox-core/product/templates/story-tmpl.yaml` (template de story).

**Deliverables:**
Cada Story do PRD (numeração `{epic}.{story}`, ex: `1.1`, `1.2`, ..., `9.11`) vira um arquivo individual em `docs/stories/{epic}-{slug}/story-{epic}.{story}-{slug}.md` no formato do template AIOX, contendo:

- Título completo.
- Status inicial: `Draft`.
- Contexto: referências ao PRD e à Architecture.
- Tarefas (checkboxes) executáveis pelo @dev.
- Critérios de aceitação (copiados do PRD).
- Arquivos criados/modificados (preenchido pelo @dev).
- Notas (para comunicação dev↔qa).
- Dependências (stories anteriores necessárias).
- Estimativa de esforço (T-shirt: XS/S/M/L).

**Prioridade:** começar pelas Stories restantes do Épico 2 e seguir a ordem
definida no plano do piloto. Stories `LATER` não devem ser fragmentadas para
execução agora.

**Restrições:**
- Cada story deve caber em **uma sessão focada de 2-4 horas** de um dev solo. Se parecer maior, quebrar.
- Cada story entrega **fatia vertical** (do banco à UI) quando possível, para gerar valor demonstrável.
- Não pular referência à Architecture — cada story deve dizer explicitamente qual componente arquitetural ela toca.

**Comando sugerido para iniciar:**
```
@sm
Leia docs/prd/* e docs/architecture/*.
Fragmente o Épico 1 completo em stories individuais no formato AIOX em docs/stories/1-setup-fundacao/.
```

---

## Handoff para @po (Pax)

Depois que o @sm criar as stories, o @po **valida cada uma** com o checklist de 10 pontos (`.aiox-core/product/checklists/story-draft-checklist.md`) antes de marcar como `Ready` para o @dev.

## Ordem operacional recomendada

1. @pm → PRD (**concluído — este documento**).
2. @architect → Architecture (`docs/architecture/`).
3. @sm → Stories do Épico 1 em `docs/stories/`.
4. @po → validar cada story para `Ready`.
5. @dev → implementar em sequência.
6. @qa → validar cada story antes de `Done`.
7. Repetir 3-6 por épico.
8. @devops (opcional) → CI/CD, submissão às lojas no Épico 9.

## Regra adicional de aceite

Uma Story `SIMPLE` está completa quando a interface executa uma ação real e
observável, ainda que a operação final seja humana. Exemplo: solicitar saque
cria um registro rastreável; não precisa transferir automaticamente. Uma Story
`LATER` não pode gerar botão que simule sucesso no piloto.
