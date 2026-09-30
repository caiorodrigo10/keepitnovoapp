export interface LojistaSessao {
  authenticated: true;
}

let currentSessao: LojistaSessao | null = null;
const listeners = new Set<(sessao: LojistaSessao | null) => void>();

function notifySessionChange(): void {
  listeners.forEach((listener) => listener(currentSessao));
}

/**
 * Estabelece o sinal de sessão do Lojista no modo mock (sem validar credenciais —
 * mesmo comportamento permissivo já documentado no mock do Cliente) e
 * notifica os assinantes.
 */
export function signInLojista(): void {
  currentSessao = { authenticated: true };
  notifySessionChange();
}

/** Limpa a sessão mock do Lojista e notifica os assinantes. */
export function signOutLojista(): void {
  currentSessao = null;
  notifySessionChange();
}

/**
 * Assina mudanças de sessão. Entrega o estado atual pelo menos uma vez, de
 * forma assíncrona (mesmo espírito do `auth.mock.ts`), e retorna a função de
 * `unsubscribe`.
 */
export function onLojistaSessionChange(callback: (sessao: LojistaSessao | null) => void): () => void {
  listeners.add(callback);
  Promise.resolve().then(() => {
    if (listeners.has(callback)) {
      callback(currentSessao);
    }
  });
  return () => {
    listeners.delete(callback);
  };
}
