import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { type CadastroDraft, createEmptyCadastroDraft } from './cadastroDraft';

/**
 * Context do rascunho de cadastro — Story 0.8 (Task 2, recorte provisório).
 *
 * Estado único em memória compartilhado pelos passos 1/2/3 do fluxo de
 * cadastro (`CadastroPasso1/2/3`), para que o "estado local do formulário
 * multi-step... não vaze entre remontagens de tela sem necessidade" (ver
 * CodeRabbit Focus Areas da story). Vive dentro de `AuthStack` (provider
 * envolve o `Stack.Navigator`) — é resetado sempre que `AuthStack` é
 * desmontada (não persiste entre sessões, por design).
 */
interface CadastroDraftContextValue {
  draft: CadastroDraft;
  updateDraft: (patch: Partial<CadastroDraft>) => void;
  resetDraft: () => void;
}

const CadastroDraftContext = createContext<CadastroDraftContextValue | null>(null);

export function CadastroDraftProvider({ children }: PropsWithChildren) {
  const [draft, setDraft] = useState<CadastroDraft>(createEmptyCadastroDraft);

  const value = useMemo<CadastroDraftContextValue>(
    () => ({
      draft,
      updateDraft: (patch) => setDraft((previous) => ({ ...previous, ...patch })),
      resetDraft: () => setDraft(createEmptyCadastroDraft()),
    }),
    [draft],
  );

  return <CadastroDraftContext.Provider value={value}>{children}</CadastroDraftContext.Provider>;
}

export function useCadastroDraft(): CadastroDraftContextValue {
  const context = useContext(CadastroDraftContext);
  if (!context) {
    throw new Error('useCadastroDraft deve ser usado dentro de <CadastroDraftProvider>.');
  }
  return context;
}
