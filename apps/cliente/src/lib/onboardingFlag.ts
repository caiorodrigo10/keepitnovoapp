import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Flag "onboarding já visto" — Story 2.1, AC4.
 *
 * [IDS] CREATE — primeira lib de persistência local do monorepo (nenhuma
 * story anterior usou `AsyncStorage`/`SecureStore`, ver Dev Notes da 2.1).
 * Fica em `apps/cliente/src/lib/` (mesmo padrão de `cancelamentoPolicy.ts`):
 * é estado de UI/dispositivo, não dado de domínio — não vira port de
 * `@keepit/core-data`.
 *
 * Dado não-sensível (booleano de UX) → `AsyncStorage`, não `expo-secure-store`
 * (overkill para isso, ver Dev Notes/CLAUDE.md "nada além do necessário").
 */
const ONBOARDING_VISTO_KEY = '@keepit/cliente:onboarding_visto';

/**
 * Lê a flag. Fail-open: qualquer erro de leitura (ex.: storage indisponível)
 * retorna `false` — mostra o onboarding em vez de travar o boot do app.
 */
export async function getOnboardingVisto(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_VISTO_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

/** Marca o onboarding como visto (fim do fluxo ou "Pular"). */
export async function setOnboardingVisto(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_VISTO_KEY, 'true');
  } catch {
    // Fail-open: se a escrita falhar, o onboarding volta a aparecer na
    // próxima abertura — não é um erro que deva travar a navegação atual.
  }
}

/** Apaga a flag — usado pelo "Redefinir onboarding" em dev (AC4d). */
export async function resetOnboardingVisto(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_VISTO_KEY);
  } catch {
    // Idem — falha silenciosa, sem impacto crítico.
  }
}
