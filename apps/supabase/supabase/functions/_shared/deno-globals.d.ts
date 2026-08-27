/**
 * Declaração ambiente mínima de `Deno` — Story 7.2 (AC4), [AUTO-DECISION]
 * registrada em `docs/stories/7.2.story.md`.
 *
 * `apps/supabase/tsconfig.json` (via `tsconfig.base.json`) roda `tsc --noEmit`
 * sob o `lib` padrão de Node/DOM — sem o binário `deno` instalado no ambiente
 * de execução, o typecheck de qualquer `index.ts` de Edge Function que use
 * `Deno.serve`/`Deno.env.get` quebraria sem esta declaração. Isso NÃO afeta o
 * runtime real do Deno (Edge Runtime do Supabase), que tem seus próprios
 * globals — muito mais completos — embutidos; esta declaração só serve o `tsc`
 * do monorepo (mesma classe de decisão da Story 7.1 para `_shared/asaas.ts`,
 * ver `_shared/README.md`).
 *
 * Subset mínimo usado pelos entrypoints do piloto — reutilizável pelas Edge
 * Functions futuras (7.5/7.11), estendível se um `index.ts` futuro precisar
 * de mais superfície de `Deno`.
 */
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: {
    get(key: string): string | undefined;
  };
};
