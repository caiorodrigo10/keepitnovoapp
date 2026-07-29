# `@keepit/supabase`

Workspace de infraestrutura do Supabase (config do CLI + migrations versionadas). Não é um app rodável — não há `supabase start` local nesta arquitetura (ver `docs/ARQUITETURA.md` seção 8: os dois ambientes, `keepit-dev` e o futuro `keepit-prod`, rodam **na nuvem**, sem Docker/Postgres local).

## Estrutura

```
apps/supabase/
├── package.json
├── README.md               (este arquivo)
└── supabase/
    ├── config.toml          (gerado por `supabase init`, project_id = ref do keepit-dev)
    ├── migrations/
    │   └── <timestamp>_init_canary.sql
    └── .temp/                (artefato local do CLI, gitignored)
```

> Nota: `supabase init` cria a estrutura padrão dentro de uma subpasta `supabase/`
> (não direto na raiz do workspace). É o layout oficial do CLI e o que
> `supabase link`/`supabase db push` esperam — mantido assim mesmo que o texto
> da Story 1.4 mencione `apps/supabase/config.toml` de forma simplificada.

## Projetos

| Ambiente | Ref | Região | Status |
|---|---|---|---|
| `keepit-dev` | `jhhbewnmnorhmsdvfppo` | `sa-east-1` (São Paulo) | `ACTIVE_HEALTHY`, criado em 2026-07-29 |
| `keepit-prod` | — | — | **Não existe ainda.** Fora de escopo do Épico 1. |

O workspace já está linkado ao `keepit-dev` (`supabase link --project-ref jhhbewnmnorhmsdvfppo`, executado nesta story). Nenhuma senha de Postgres foi necessária neste ambiente — se em outro ambiente o `link` pedir a senha do banco interativamente, ela pode ser passada via `--password` ou variável `SUPABASE_DB_PASSWORD` (dashboard → Project Settings → Database).

## Como aplicar migrations

O SQL de cada migration vive versionado em `supabase/migrations/`, mas hoje (MVP solo) existem dois caminhos possíveis para aplicá-las no banco `keepit-dev`:

### Caminho 1 — Orquestrador via MCP do Supabase (usado nesta story)

O orquestrador (Claude com acesso ao MCP do Supabase) roda `apply_migration` apontando para o projeto, o que é funcionalmente equivalente a um `db push` e evita depender da senha do Postgres. Essa foi a forma usada para aplicar a migration `_canary` desta story. O SQL correspondente permanece no repositório para auditoria — não há divergência de fonte de verdade entre o que está versionado e o que está no banco.

### Caminho 2 — CLI local (`supabase db push`)

Com o workspace já linkado (feito nesta story), é possível rodar diretamente:

```bash
cd apps/supabase
supabase db push --project-ref jhhbewnmnorhmsdvfppo
```

Isso aplica todas as migrations em `supabase/migrations/` que ainda não constam no histórico de migrations do projeto remoto.

## Como regenerar os tipos TypeScript

Sempre que o schema do banco mudar, os tipos em `packages/shared-types/src/supabase.ts` precisam ser regenerados por um dos dois caminhos:

### Caminho 1 — MCP do Supabase (usado nesta story)

O orquestrador roda a tool `generate_typescript_types` do MCP e entrega o conteúdo, que é colado em `packages/shared-types/src/supabase.ts` (arquivo gerado — não editar manualmente, ver comentário no topo do arquivo).

### Caminho 2 — CLI local

```bash
supabase gen types typescript --project-id jhhbewnmnorhmsdvfppo > ../../packages/shared-types/src/supabase.ts
```

Depois de regenerar, rodar `pnpm turbo run typecheck` na raiz do monorepo para confirmar que nenhum consumidor quebrou.

## Segurança

- `SUPABASE_SERVICE_ROLE_KEY` **nunca** deve ser usada por este workspace nem por nenhum dos apps `cliente`/`lojista`/`admin`. Ela existe só para uso futuro em Edge Functions/scripts server-side, via `createServiceRoleClient()` de `packages/supabase-client`.
- Nenhum segredo é versionado neste workspace — `config.toml` não contém chaves (usa `env(...)` como referência), e o `.env` real fica só na raiz do monorepo (gitignored).
