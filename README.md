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
```

## CI (Integração Contínua)

Toda **Pull Request para `main`** dispara o workflow `.github/workflows/ci.yml`, que roda
`pnpm turbo run lint typecheck test` em todos os workspaces. PRs com lint/typecheck/test
quebrados não devem ser mergeadas. (Requer o repositório hospedado no GitHub — Story 1.5.)

<!-- smoke test: valida a execução do workflow de CI em um PR (Story 1.5, AC3) -->
<!-- ci re-trigger: synchronize event p/ PR #1 (repo agora público, Actions grátis) -->

