/**
 * Guard de autenticação — STUB TEMPORÁRIO (Épico 0, Story 0.3).
 *
 * **Não usado por `RootNavigator` desde a Story 2.3.1** — `RootNavigator.tsx`
 * passou a decidir `Auth` vs. `Main` via estado de sessão observado em
 * `getDataClient().auth.onAuthStateChange(...)`, não mais via esta função
 * pura sem estado (ver JSDoc de `RootNavigator.tsx` para o motivo). Este
 * arquivo é mantido — não excluído — apenas por não ter nenhum outro
 * consumidor identificado no escopo da Story 2.3.1 (que não fez `grep` de
 * referências cruzadas em todo o repo; se algum outro import aparecer, ver
 * Dev Agent Record da 2.3.1).
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
