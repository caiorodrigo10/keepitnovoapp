/**
 * Erro padronizado para todo método stub das 8 implementações Supabase
 * (Story 1.9). Cada `*.supabase.ts` lança esta classe em vez de deixar o
 * método simplesmente ausente/`undefined` — assim o contrato assíncrono da
 * port é respeitado (a Promise REJEITA, nunca resolve silenciosamente) e a
 * mensagem já aponta exatamente qual épico (2-9) é responsável por
 * substituir o stub pela query/mutação real contra o schema Supabase.
 *
 * Convenção de `epicHint`: usar o épico do domínio de negócio da port (ver
 * tabela port → épico no Dev Notes da Story 1.9, `docs/stories/1.9.story.md`).
 * Para `AdminPort`, que mistura responsabilidades de 3 épicos diferentes
 * (Épico 3 — aprovação de lojista; Épico 4 — CRUD de hubs; Épico 8 — demais
 * operações administrativas), o `epicHint` é escolhido por MÉTODO, não um
 * valor fixo para o arquivo inteiro.
 */
export class NotImplementedError extends Error {
  constructor(
    public readonly port: string,
    public readonly method: string,
    public readonly epicHint: string,
  ) {
    super(`[core-data/supabase] ${port}.${method} — implementar no ${epicHint}`);
    this.name = 'NotImplementedError';
  }
}
