#!/usr/bin/env node
// Smoke test manual de conectividade — Story 1.4, AC7.
//
// Confirma que o wrapper `createClient()` deste pacote consegue de fato
// conversar com o projeto Supabase cloud `keepit-dev`, lendo a tabela
// `_canary` (criada só como prova de conexão — não modela regra de negócio).
//
// Como rodar (a partir da raiz do monorepo):
//   pnpm --filter @keepit/supabase-client canary-check
//
// Ou diretamente (requer SUPABASE_URL/SUPABASE_ANON_KEY já exportadas no
// ambiente, ou passe --env-file manualmente):
//   node --env-file-if-exists=../../.env packages/supabase-client/scripts/canary-check.mjs
//
// Decisão de implementação (@dev, Story 1.4):
// - Script `.mjs` puro, sem `tsx`/`ts-node` como devDependency nova — o monorepo
//   não usa nenhum runner desses hoje. O Node 22.x deste ambiente já faz
//   "type stripping" nativo de arquivos `.ts` simples (sem flag extra), então
//   este script importa `createClient()` diretamente do `../src/index.ts`,
//   reaproveitando o wrapper real em vez de duplicar a lógica de conexão.
// - Env vars carregadas via `node --env-file-if-exists=../../.env` (nativo do
//   Node >= 20.6), sem adicionar `dotenv` como dependência nova. Ver script
//   `canary-check` em package.json.

import { createClient } from '../src/index.ts';

async function main() {
  const client = createClient();

  const { data, error } = await client.from('_canary').select('*');

  if (error) {
    console.error('[canary-check] FALHOU — erro ao consultar _canary:');
    console.error(error);
    process.exitCode = 1;
    return;
  }

  console.log('[canary-check] OK — conexão com keepit-dev confirmada.');
  console.log(`[canary-check] Linhas retornadas de _canary: ${data.length}`);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('[canary-check] FALHOU — exceção inesperada:');
  console.error(err);
  process.exitCode = 1;
});
