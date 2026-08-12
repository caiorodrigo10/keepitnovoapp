/**
 * Story 3.7 (AC6) — expõe `DATA_SOURCE`/`SUPABASE_URL`/`SUPABASE_ANON_KEY`
 * (sem prefixo — `@keepit/supabase-client`/`@keepit/core-data` leem essas
 * chaves sem prefixo como fallback quando `EXPO_PUBLIC_*` está ausente, ver
 * `packages/supabase-client/src/index.ts#readEnv`) para o bundle client E
 * server do Admin via o campo `env` do Next.js — o único mecanismo do
 * Next.js que inlineia uma env var SEM o prefixo `NEXT_PUBLIC_` (necessário
 * aqui porque nenhum app deste monorepo usa esse prefixo; `.env` fica na
 * raiz do monorepo, não em `apps/admin/`, então quem inicia
 * `next dev`/`next build` precisa ter essas variáveis no ambiente do
 * processo — ex.: `source .env` antes do comando).
 *
 * ⚠️ NUNCA adicionar `SUPABASE_SERVICE_ROLE_KEY` aqui — ela ignora RLS por
 * completo e não pode entrar no bundle do Admin (CodeRabbit Focus Area da
 * Story 3.7). A anon key é segura por construção (a proteção é a RLS).
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  env: {
    DATA_SOURCE: process.env.DATA_SOURCE,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
