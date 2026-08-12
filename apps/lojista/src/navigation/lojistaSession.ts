import { CURRENT_ESTABELECIMENTO_ID } from '../screens/catalogo/currentStore';

/**
 * Sessão mock do Lojista — Story 9.0.4.
 *
 * Módulo **local ao app Lojista**, inteiramente fora de
 * `packages/core-data`. Ver "Decisão de representação da sessão mock do
 * Lojista" em `docs/stories/9.0.4.story.md` para o racional completo: o
 * `AuthPort`/`auth.mock.ts` de `packages/core-data` são tipados
 * exclusivamente em `Cliente` (sessão global `db.sessionClienteId`) — não há
 * hoje uma entidade "pessoa responsável pela loja que faz login" distinta da
 * própria loja (`Estabelecimento` não tem credenciais). Reaproveitar a
 * sessão do Cliente aqui acoplaria os dois apps numa mesma chave global, o
 * que esta story evita deliberadamente.
 *
 * Padrão reativo (pub/sub com `Set` nativo, notificação assíncrona "pelo
 * menos uma vez" na assinatura) espelha `packages/core-data/src/mock/auth.mock.ts`
 * (Story 2.3.1), mas com um tipo próprio (`LojistaSessao`) e sem nenhuma
 * dependência de `packages/core-data`.
 *
 * **Story 3.10 (decisão tomada).** A auth real do Lojista estende
 * `LojistaAuthPort` (`packages/core-data`, ver JSDoc do arquivo para o
 * `[AUTO-DECISION]` completo) — este módulo NÃO foi substituído por ela.
 * `signInLojista()` continua existindo como o flag local que
 * `RootNavigator` observa para alternar `Auth`/`Main`, mas deixou de ser
 * chamado incondicionalmente por `Login.tsx`: agora só é chamado como
 * CONSEQUÊNCIA de uma autenticação real bem-sucedida SEGUIDA de uma leitura
 * real do próprio `estabelecimentos.status = 'ativo'` (ver JSDoc de
 * `Login.tsx`). Continua "local ao app" porque nenhuma tela de `MainTabs`
 * lê ainda a identidade real do lojista logado — todas usam
 * `CURRENT_ESTABELECIMENTO_ID` fixo (`screens/catalogo/currentStore.ts`),
 * reconciliar isso é carry-forward para o Épico 6+, fora do escopo da Story
 * 3.10.
 */
export interface LojistaSessao {
  estabelecimentoId: string;
}

let currentSessao: LojistaSessao | null = null;
const listeners = new Set<(sessao: LojistaSessao | null) => void>();

function notifySessionChange(): void {
  listeners.forEach((listener) => listener(currentSessao));
}

/**
 * Estabelece a sessão mock do Lojista (id fixo, sem validar credenciais —
 * mesmo comportamento permissivo já documentado no mock do Cliente) e
 * notifica os assinantes.
 */
export function signInLojista(): void {
  currentSessao = { estabelecimentoId: CURRENT_ESTABELECIMENTO_ID };
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
