/**
 * Guard de autenticação — STUB DESATIVADO desde a Story 9.0.4.
 *
 * **Não é mais importado por `RootNavigator.tsx`** — `RootNavigator` agora
 * decide `Auth`/`Main` observando a sessão mock local do Lojista
 * (`./lojistaSession.ts`), que reage de verdade a login/logout. Este
 * arquivo é mantido (não excluído) por histórico e por precaução contra
 * consumidores não previstos — ver Task 3/Task 6 da Story 9.0.4 para o grep
 * de verificação.
 *
 * Esta implementação sempre deixava o usuário passar (`isAuthenticated()`
 * === `true`) por padrão, para permitir navegar pela `MainTabs` sem precisar
 * de login (Épico 0, Story 0.3). Este guard NUNCA persistiu estado (sem
 * AsyncStorage/SecureStore) e NUNCA validou nenhuma sessão real.
 */
export const AUTH_GUARD_ENABLED = false;

export function isAuthenticated(): boolean {
  if (!AUTH_GUARD_ENABLED) {
    return true;
  }

  return false;
}
