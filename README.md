# Keepit — Monorepo

Marketplace hiperlocal click-and-collect. MVP com pnpm workspaces + Turborepo.

## Pré-requisitos

- **Node.js** 20 ou superior (recomendado 22 LTS)
- **pnpm** 9 ou superior (`npm install -g pnpm@9`)
- **Git**

Instalação verificável:

```bash
node --version   # v20.x ou v22.x
pnpm --version   # 9.x
```

## Estrutura

```
apps/
  cliente/     # Expo (iOS + Android) — Story 1.6
  lojista/     # Expo (iOS + Android) — Story 1.7
  admin/       # Next.js (Vercel) — Story 1.8
  supabase/    # Migrations SQL + Edge Functions — Story 1.4
packages/
  shared-types/    # Tipos TypeScript gerados do schema Supabase
  supabase-client/ # Wrapper tipado do supabase-js
  ui-tokens/       # Paleta, tipografia, tokens do design system
```

## Comandos

```bash
pnpm install          # Instalar dependências
pnpm typecheck        # Checar tipos em todos os projetos
pnpm build            # Build de todos os projetos
pnpm lint             # Lint em todos os projetos
pnpm test             # Testes em todos os projetos
pnpm dev              # Levantar todos os apps em modo dev
pnpm qa               # Gate de qualidade: lint + typecheck + test (mesma cadeia do CI)
```

## CI (Integração Contínua)

> ⚠️ **GitHub Actions está bloqueado nesta conta.** O workflow `.github/workflows/ci.yml`
> está correto e ativo, mas o GitHub não cria nenhuma run (0 runs após múltiplos gatilhos,
> inclusive com o repositório público). A causa é a nível de **conta**, não do repositório —
> ver `.claude/agent-memory/aiox-devops/project_ci_actions_not_running.md`.

**Enquanto isso, o gate de qualidade é local e obrigatório.** Antes de cada commit:

```bash
pnpm qa   # equivalente a `turbo run lint typecheck test` — mesma cadeia do ci.yml
```

Nenhum commit deve entrar em `main` com `pnpm qa` quebrado. Quando as Actions voltarem a
rodar, o `ci.yml` já cobre exatamente o mesmo comando — nada precisa mudar.

**Cobertura atual do gate (honesta):** `typecheck` roda `tsc --noEmit` de verdade em
`cliente`, `lojista`, `admin` e nos packages TS; `test` roda Vitest em `core-data` e
`config`. O `lint` é `echo skipped` em todos os workspaces — ainda não há ESLint
configurado. Tratar "qa verde" como prova de tipos e testes, não de estilo.

