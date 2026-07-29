/**
 * Guard de autenticação — STUB TEMPORÁRIO (Épico 0, Story 0.3).
 *
 * Esta implementação sempre deixa o usuário passar (`isAuthenticated()` ===
 * `true`) por padrão, para permitir navegar pela `MainTabs` sem precisar de
 * login. Para testar manualmente o fluxo deslogado (`AuthStack`), alterne
 * `AUTH_GUARD_ENABLED` para `true` neste arquivo.
 *
 * Este guard NÃO persiste estado (sem AsyncStorage/SecureStore) e NÃO
 * valida nenhuma sessão real — será substituído por autenticação de verdade
 * fora do escopo do Épico 0 (casca visual).
 */
export const AUTH_GUARD_ENABLED = false;

export function isAuthenticated(): boolean {
  if (!AUTH_GUARD_ENABLED) {
    return true;
  }

  return false;
}
