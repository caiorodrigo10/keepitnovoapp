/**
 * Story 2.3 (Task 6, AC4) — [IDS] CREATE.
 *
 * Nenhum tipo de erro em `packages/core-data` distingue "e-mail já
 * cadastrado" de qualquer outra falha de `signUp`. Sem essa distinção,
 * `CriarConta.tsx` (Task 7) não consegue cumprir a AC4 ("erro de e-mail já
 * existente é mostrado claramente na tela") — cairia num catch genérico
 * indistinguível de erro de rede.
 *
 * O SDK `@supabase/supabase-js` (v2.111) **não lança exceção** para e-mail
 * duplicado — `signUp` resolve normalmente com `{ data, error }`. Dois
 * sinais observados na doc/código do SDK (`@supabase/auth-js`) indicam
 * duplicidade, e ambos são checados por quem lança este erro
 * (`auth.supabase.ts#signUp`):
 * 1. `error.code === 'user_already_exists'` (ou legado `'email_exists'`) —
 *    ocorre quando o projeto está configurado para revelar duplicidade.
 * 2. **Obfuscação intencional do Supabase:** com `Confirm email` ON (estado
 *    atual do `keepit-dev`, ver Task 4 pendente), um signup para e-mail já
 *    existente retorna **sucesso aparente** (`error: null`), mas
 *    `data.user.identities` vem como um array **vazio** — o Supabase evita
 *    confirmar a existência do e-mail por e-mail de verificação, mas ainda
 *    assim expõe esse sinal na resposta síncrona. Documentado no changelog
 *    oficial do Supabase Auth (comportamento estável desde 2023, mantido no
 *    SDK instalado neste projeto — não presumido, é o shape observado no
 *    tipo `AuthResponse` do pacote instalado).
 */
export class EmailJaExisteError extends Error {
  constructor(email: string) {
    super(`[core-data/supabase] auth.signUp — e-mail já cadastrado: ${email}`);
    this.name = 'EmailJaExisteError';
  }
}
